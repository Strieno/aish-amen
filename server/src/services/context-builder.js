import { all, get } from '../db/index.js';
import { getSetting } from './settings.js';
import { parseJson } from '../lib/util.js';
import { gatherContext, formatLifeContext } from './life-context.js';
import { buildContextPacket } from './context/ace.js';
import { serializePacket } from './context/compressor.js';

/**
 * Builds a token-budgeted context object for an AI request.
 * Delegates cross-domain retrieval to the LifeContextEngine; adds the user
 * profile, today's schedule and RAG knowledge on top. When ACE is healthy it
 * also attaches a ranked ContextPacket (`context.ace`) and its prompt-safe
 * serialization (`context.aceText`) — with a graceful fallback to the
 * previous pipeline so the chat never stops.
 */
export function buildContext({ assistant, userMessage, mode = 'general', pinnedContext = [] }) {
  const profile = buildProfile();
  const perms = assistant?.memory_permissions
    ? parseJson(assistant.memory_permissions, {})
    : {};
  const kbIds = assistant?.knowledge_base_ids
    ? parseJson(assistant.knowledge_base_ids, [])
    : [];

  const gathered = gatherContext({
    message: userMessage || '',
    mode,
    pinnedContext,
    permissions: {
      memories: perms.memory !== false,
      tasks: perms.tasks !== false,
      journal: perms.journal !== false,
      checkins: perms.checkins !== false,
      study: perms.study !== false,
      work: perms.work !== false,
      safe: true,
    },
  });

  const schedule = getTodaySchedule();
  const context = {
    profile,
    mode,
    gathered,
    sections: gathered.sections,
    items: gathered.items,
    knowledge: gathered.knowledge,
    recentActivity: gathered.recentActivity,
    schedule,
    safePlan: getActiveSafePlan(),
    memories: (gathered.sections.memories || []).map((m) => ({ content: m.title, importance: 0.5, source: 'memory', tags: [] })),
    tasks: (gathered.sections.tasks || []).map((t) => ({ id: t.id, title: t.title, priority: 'medium', energy: 'medium', status: 'open', due_date: null })),
    kbIds,
  };

  // ACE — never let it break the chat; on failure keep the classic pipeline.
  try {
    const ace = buildContextPacket({
      message: userMessage || '',
      mode,
      permissions: {
        memories: perms.memory !== false,
        tasks: perms.tasks !== false,
        journal: perms.journal !== false,
        checkins: perms.checkins !== false,
        study: perms.study !== false,
        work: perms.work !== false,
        safe: true,
      },
    });
    context.ace = ace;
    context.aceText = serializePacket(ace);
  } catch (error) {
    context.ace = null;
    context.aceText = null;
    context.aceError = error.message;
  }

  return context;
}

function buildProfile() {
  const prefs = getSetting('userPreferences') || {};
  const user = getSetting('userName') || '';
  return {
    name: user,
    language: getSetting('language') || 'ar',
    responseStyle: prefs.responseStyle || 'balanced',
    tone: prefs.tone || 'calm',
    technicalLevel: prefs.technicalLevel || 'intermediate',
  };
}

function getTodaySchedule() {
  const today = new Date().toISOString().slice(0, 10);
  return all(
    `SELECT id, title, start, end, category FROM calendar_events
     WHERE start LIKE ? ORDER BY start LIMIT 16`,
    `${today}%`,
  );
}

export function getActiveSafePlan() {
  const row = get(
    `SELECT sp.* FROM safe_living_sessions s
     JOIN safe_living_plans sp ON sp.id = s.plan_id
     WHERE s.status = 'active' ORDER BY s.activated_at DESC LIMIT 1`,
  );
  return row ? parseJson(row, null) : null;
}

export function formatContextForPrompt(ctx) {
  const lines = [];
  if (ctx.profile?.name) lines.push(`المستخدم: ${ctx.profile.name}`);

  // ACE path: the ranked, compressed, injection-safe ContextPacket.
  if (ctx.aceText) {
    lines.push(ctx.aceText);
    return lines.join('\n');
  }

  // Legacy fallback path (ACE failed or disabled).
  if (ctx.gathered) {
    const body = formatLifeContext(ctx.gathered, { tokenBudget: 1500 });
    if (body) lines.push(body);
  }
  if (ctx.schedule?.length) {
    lines.push('جدول اليوم:');
    ctx.schedule.forEach((e) => lines.push(`- ${e.start.slice(11, 16)} ${e.title}`));
  }
  if (ctx.safePlan) {
    lines.push(`الخطة النشطة: ${ctx.safePlan.name}`);
    if (ctx.safePlan.immediate_actions) {
      lines.push('إجراءات فورية:');
      parseJson(ctx.safePlan.immediate_actions, []).forEach((a) => lines.push(`- ${a}`));
    }
  }
  return lines.join('\n');
}
