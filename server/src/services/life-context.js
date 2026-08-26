import { all, get } from '../db/index.js';
import { getSetting } from './settings.js';
import { searchMemories } from './memory.js';
import { searchKnowledge } from './knowledge.js';
import { getEntityLinks } from './links.js';
import { getRecentActivity } from './activity.js';
import { parseJson, estimateTokens } from '../lib/util.js';

/**
 * LifeContextEngine — the unified contextual intelligence layer.
 *
 * Retrieves the most relevant, token-budgeted context from every domain in
 * the app (memories, tasks, journal, check-ins, goals, study, work, safe
 * living, conversations, links, activity) and ranks it by semantic relevance,
 * recency, importance, and per-mode domain weights.
 */

const DAY = 86400000;

export const CONTEXT_MODES = ['general', 'university', 'work', 'safe', 'reflection', 'planning'];

// Domain weight multipliers per context mode (weighting, not hard filtering).
const MODE_WEIGHTS = {
  general: { memories: 1, tasks: 1, journal: 1, checkins: 1, goals: 1, courses: 1, exams: 1, focus: 0.8, work: 0.8, safe: 0.8, conversations: 1 },
  university: { memories: 1.2, tasks: 1.2, journal: 0.8, checkins: 0.7, goals: 1.1, courses: 1.8, exams: 2, focus: 1.3, work: 0.3, safe: 0.4, conversations: 1.2 },
  work: { memories: 0.9, tasks: 1, journal: 0.5, checkins: 0.5, goals: 0.8, courses: 0.2, exams: 0.2, focus: 0.4, work: 2, safe: 0.4, conversations: 0.9 },
  safe: { memories: 1, tasks: 0.9, journal: 1.1, checkins: 1.3, goals: 0.6, courses: 0.3, exams: 0.3, focus: 0.5, work: 0.4, safe: 2.2, conversations: 0.8 },
  reflection: { memories: 1.3, tasks: 0.7, journal: 2, checkins: 1.5, goals: 0.8, courses: 0.4, exams: 0.4, focus: 0.8, work: 0.5, safe: 1, conversations: 0.8 },
  planning: { memories: 0.9, tasks: 1.6, journal: 0.6, checkins: 0.8, goals: 1.5, courses: 1, exams: 1.3, focus: 1, work: 0.8, safe: 0.8, conversations: 0.8 },
};

const DEFAULT_READ = { journal: true, tasks: true, study: true, work: true, memories: true, checkins: true, safe: true };

export function getAiPermissions() {
  const ai = getSetting('ai') || {};
  return {
    read: { ...DEFAULT_READ, ...(ai.permissions?.read || {}) },
    write: { tasks: true, memories: true, journal: true, goals: true, work_notes: true, study: true, ...(ai.permissions?.write || {}) },
  };
}

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Semantic-ish score: keyword overlap + substring hits. */
function relevanceScore(queryTokens, text) {
  if (!text) return 0;
  const lower = String(text).toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (lower.includes(t)) score += 1;
  }
  return score;
}

function recencyDecay(iso) {
  if (!iso) return 0.5;
  const days = (Date.now() - new Date(iso).getTime()) / DAY;
  return Math.max(0, 1 - days / 30);
}

export function titleForEntity(type, id) {
  if (!id) return null;
  const row = getEntityRow(type, id);
  return row;
}

function getEntityRow(type, id) {
  if (!id) return null;
  switch (type) {
    case 'task': return get('SELECT id, title, priority, status, due_date FROM tasks WHERE id = ?', String(id));
    case 'journal': return get('SELECT id, title, entry_date FROM journal_entries WHERE id = ?', String(id));
    case 'goal': return get('SELECT id, title, life_area, status FROM goals WHERE id = ?', String(id));
    case 'milestone': return get('SELECT id, title, goal_id FROM goal_milestones WHERE id = ?', String(id));
    case 'course': return get('SELECT id, name, code FROM courses WHERE id = ?', String(id));
    case 'exam': return get('SELECT id, title, exam_date FROM exams WHERE id = ?', String(id));
    case 'checkin': return get('SELECT id, entry_date FROM checkins WHERE id = ?', String(id));
    case 'focus_session': return get('SELECT id, minutes, started_at FROM focus_sessions WHERE id = ?', String(id));
    case 'work_note': return get('SELECT id, title FROM work_notes WHERE id = ?', String(id));
    case 'safe_living_plan': return get('SELECT id, name FROM safe_living_plans WHERE id = ?', String(id));
    case 'conversation': return get('SELECT id, title FROM conversations WHERE id = ?', String(id));
    case 'memory': return get('SELECT id, content FROM memories WHERE id = ?', String(id));
    default: return null;
  }
}

function compactRow(row, type, { score = 0, why = '' } = {}) {
  if (!row) return null;
  const item = { type, id: String(row.id), score: Number(score.toFixed(2)), why };
  switch (type) {
    case 'task':
      item.title = row.title;
      item.sub = `${row.priority === 'high' ? 'مستعجلة' : row.priority || ''}${row.due_date ? ` — حتى ${row.due_date}` : ''}`;
      break;
    case 'journal':
      item.title = row.title || 'بدون عنوان';
      item.sub = row.entry_date;
      break;
    case 'goal':
      item.title = row.title;
      item.sub = row.life_area || 'هدف';
      break;
    case 'milestone':
      item.title = row.title;
      item.sub = 'مرحلة';
      break;
    case 'course':
      item.title = `${row.name}${row.code ? ` (${row.code})` : ''}`;
      item.sub = 'مادة دراسية';
      break;
    case 'exam':
      item.title = row.title;
      item.sub = row.exam_date ? `امتحان — ${row.exam_date}` : 'امتحان';
      break;
    case 'checkin':
      item.title = `تسجيل ${row.entry_date}`;
      item.sub = 'حالة يومية';
      break;
    case 'focus_session':
      item.title = `جلسة تركيز ${row.minutes} دقيقة`;
      item.sub = row.started_at?.slice(0, 10);
      break;
    case 'work_note':
      item.title = row.title;
      item.sub = 'ملاحظة عمل';
      break;
    case 'safe_living_plan':
      item.title = row.name;
      item.sub = 'خطة عيش آمن';
      break;
    case 'conversation':
      item.title = row.title;
      item.sub = 'محادثة';
      break;
    case 'memory':
      item.title = row.content.slice(0, 90);
      item.sub = 'ذاكرة';
      break;
    default:
      item.title = String(row.id);
  }
  return item;
}

/**
 * Main entry: gather ranked cross-domain context for a user message.
 * Returns { sections, items, contextText, counts }.
 */
export function gatherContext({ message = '', mode = 'general', permissions = null, pinnedContext = [], limits = {} }) {
  const perms = permissions || getAiPermissions().read;
  const weights = MODE_WEIGHTS[mode] || MODE_WEIGHTS.general;
  const queryTokens = [...tokenize(message)];
  const limit = (k, d) => (limits && limits[k] !== undefined ? limits[k] : d);

  const items = [];
  const sections = {};

  const addDomain = (key, rows, { scoreBase = 0 } = {}) => {
    const allowed = perms[key] !== false;
    if (!allowed) return;
    const list = rows
      .map((r) => compactRow(r.row, r.type, { score: scoreBase + r.score * weights[key], why: r.why || 'صلة دلالية' }))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (list.length) {
      items.push(...list);
      sections[key] = list;
    }
  };

  // Memories
  if (perms.memories !== false) {
    const mems = searchMemories(message || '', { limit: limit('memories', 6), aiAccess: true });
    addDomain('memories', mems.map((m) => ({ type: 'memory', row: { id: m.id, content: m.content }, score: relevanceScore(queryTokens, m.content) + m.importance, why: `أهمية ${m.importance.toFixed(1)}` })));
  }

  // Tasks (open; boosted by recency, priority and deadlines)
  if (perms.tasks !== false) {
    const rows = all(
      `SELECT id, title, priority, status, due_date, updated_at FROM tasks
       WHERE status NOT IN ('done','cancelled')
       ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC
       LIMIT 40`,
    );
    const scored = rows.map((r) => {
      const rel = relevanceScore(queryTokens, r.title);
      const prio = r.priority === 'high' ? 0.6 : r.priority === 'medium' ? 0.3 : 0.1;
      const urgent = r.due_date && r.due_date < new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10) ? 0.5 : 0;
      const score = rel * 1.5 + prio + urgent + recencyDecay(r.updated_at) * 0.2;
      return { type: 'task', row: r, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit('tasks', 6));
    addDomain('tasks', scored, {});
  }

  // Journal (AI-allowed entries only)
  if (perms.journal !== false) {
    const rows = all('SELECT id, title, content, entry_date FROM journal_entries WHERE ai_access = 1 ORDER BY entry_date DESC LIMIT 20');
    const scored = rows.map((r) => ({ type: 'journal', row: r, score: relevanceScore(queryTokens, `${r.title} ${r.content}`) * 1.2 + recencyDecay(r.entry_date) * 0.4 }))
      .sort((a, b) => b.score - a.score).slice(0, limit('journal', 4));
    addDomain('journal', scored, {});
  }

  // Check-ins
  if (perms.checkins !== false) {
    const rows = all('SELECT id, entry_date, energy, stress, sleep_hours, concern, success FROM checkins ORDER BY entry_date DESC LIMIT 10');
    const scored = rows.map((r) => ({
      type: 'checkin',
      row: { id: r.id, entry_date: r.entry_date },
      score: relevanceScore(queryTokens, `${r.concern} ${r.success}`) + recencyDecay(r.entry_date) * 0.6,
      why: r.concern ? 'مصدر قلق مذكور' : 'حديثة',
    })).sort((a, b) => b.score - a.score).slice(0, limit('checkins', 3));
    addDomain('checkins', scored, {});
  }

  // Goals
  if (perms.tasks !== false) {
    const rows = all("SELECT id, title, life_area, status, progress FROM goals WHERE status = 'active' ORDER BY created_at DESC LIMIT 15");
    const scored = rows.map((r) => ({ type: 'goal', row: r, score: relevanceScore(queryTokens, r.title) + 0.3 }))
      .sort((a, b) => b.score - a.score).slice(0, limit('goals', 4));
    addDomain('goals', scored, {});
  }

  // Courses
  if (perms.study !== false) {
    const rows = all('SELECT id, name, code FROM courses ORDER BY created_at DESC LIMIT 15');
    const scored = rows.map((r) => ({ type: 'course', row: r, score: relevanceScore(queryTokens, `${r.name} ${r.code || ''}`) }))
      .sort((a, b) => b.score - a.score).slice(0, limit('courses', 4));
    addDomain('courses', scored, {});
  }

  // Exams (upcoming first)
  if (perms.study !== false) {
    const rows = all(
      `SELECT e.id, e.title, e.exam_date, c.name AS course_name FROM exams e
       JOIN courses c ON c.id = e.course_id
       ORDER BY CASE WHEN e.exam_date IS NULL THEN 1 ELSE 0 END, e.exam_date ASC LIMIT 20`,
    );
    const scored = rows.map((r) => {
      const daysTo = r.exam_date ? (new Date(r.exam_date).getTime() - Date.now()) / DAY : 999;
      const soon = daysTo >= 0 && daysTo <= 14 ? 1.2 : daysTo < 0 ? 0 : 0.3;
      return { type: 'exam', row: { id: r.id, title: `${r.title} (${r.course_name})`, exam_date: r.exam_date }, score: relevanceScore(queryTokens, `${r.title} ${r.course_name}`) + soon };
    }).sort((a, b) => b.score - a.score).slice(0, limit('exams', 4));
    addDomain('exams', scored, {});
  }

  // Focus
  if (perms.study !== false) {
    const rows = all('SELECT id, minutes, started_at, completed FROM focus_sessions ORDER BY started_at DESC LIMIT 12');
    const scored = rows.map((r) => ({ type: 'focus_session', row: r, score: recencyDecay(r.started_at) * 0.5 + (r.completed ? 0.2 : 0) }))
      .sort((a, b) => b.score - a.score).slice(0, limit('focus', 3));
    addDomain('focus', scored, {});
  }

  // Work notes
  if (perms.work !== false) {
    const rows = all('SELECT id, title, content, updated_at FROM work_notes ORDER BY updated_at DESC LIMIT 12');
    const scored = rows.map((r) => ({ type: 'work_note', row: r, score: relevanceScore(queryTokens, `${r.title} ${r.content}`) }))
      .sort((a, b) => b.score - a.score).slice(0, limit('work', 3));
    addDomain('work', scored, {});
  }

  // Safe plans (active plan first)
  if (perms.safe !== false) {
    const rows = all(
      `SELECT sp.id, sp.name FROM safe_living_plans sp
       ORDER BY EXISTS(SELECT 1 FROM safe_living_sessions s WHERE s.plan_id = sp.id AND s.status = 'active') DESC, sp.created_at DESC LIMIT 6`,
    );
    const scored = rows.map((r) => ({ type: 'safe_living_plan', row: r, score: relevanceScore(queryTokens, r.name) + 0.4 }))
      .sort((a, b) => b.score - a.score).slice(0, limit('safe', 2));
    addDomain('safe', scored, {});
  }

  // Conversations (recent + relevant)
  if (perms.tasks !== false) {
    const rows = all(
      `SELECT c.id, c.title, c.updated_at, COUNT(m.id) AS msg_count FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 15`,
    );
    const scored = rows.map((r) => ({ type: 'conversation', row: r, score: relevanceScore(queryTokens, r.title) + recencyDecay(r.updated_at) * 0.5 }))
      .sort((a, b) => b.score - a.score).slice(0, limit('conversations', 3));
    addDomain('conversations', scored, {});
  }

  // Pinned context: always included, high score
  for (const pinned of pinnedContext || []) {
    const row = getEntityRow(pinned.type, pinned.id);
    if (!row) continue;
    const item = compactRow(row, pinned.type, { score: 10, why: 'مثبّت من قبل المستخدم' });
    if (item) {
      item.pinned = true;
      items.push(item);
      if (!sections.pinned) sections.pinned = [];
      sections.pinned.push(item);
    }
  }

  // Knowledge (RAG) when the message looks like a content question
  let knowledge = [];
  if (perms.study !== false && message && message.length > 12) {
    knowledge = searchKnowledge(message, { limit: 3 });
  }

  // Recent activity (for continuity)
  const recentActivity = getRecentActivity({ limit: 8 }).map((a) => ({
    type: 'activity',
    id: a.id,
    title: a.summary,
    sub: a.ts?.slice(0, 10),
    score: 0,
  }));

  // Dedupe + sort
  const seen = new Set();
  const unique = [];
  for (const it of items) {
    const key = `${it.type}:${it.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  unique.sort((a, b) => b.score - a.score);

  return {
    sections,
    items: unique,
    knowledge,
    recentActivity,
    counts: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])),
  };
}

/** Compact Arabic summary of the context for the prompt. */
export function formatLifeContext(gathered, { tokenBudget = 1500 } = {}) {
  const lines = [];
  let used = 0;
  const push = (s) => {
    const t = estimateTokens(s);
    if (used + t > tokenBudget) return false;
    lines.push(s);
    used += t;
    return true;
  };

  const domainHeaders = {
    memories: 'ذكريات ذات صلة',
    tasks: 'مهام نشطة',
    journal: 'من اليوميات',
    checkins: 'تسجيلات الحالة',
    goals: 'أهداف نشطة',
    courses: 'المواد الدراسية',
    exams: 'امتحانات',
    focus: 'جلسات تركيز',
    work: 'ملاحظات العمل',
    safe: 'خطط العيش الآمن',
    conversations: 'محادثات ذات صلة',
    pinned: 'سياق مثبّت',
  };

  for (const [key, header] of Object.entries(domainHeaders)) {
    const list = gathered.sections?.[key];
    if (!list?.length) continue;
    if (!push(`— ${header} —`)) break;
    for (const it of list.slice(0, 6)) {
      if (!push(`- ${it.title}${it.sub ? ` (${it.sub})` : ''}${it.why ? ` [${it.why}]` : ''}`)) break;
    }
  }
  if (gathered.knowledge?.length) {
    push('— من قاعدة المعرفة —');
    for (const k of gathered.knowledge) {
      if (!push(`[${k.filename}] ${k.content.slice(0, 500)}`)) break;
    }
  }
  return lines.join('\n');
}

/** Explain why each item was included (for the "why" / provenance UI). */
export function explainContextItem(item) {
  return {
    ...item,
    explanation: item.why || (item.pinned ? 'ثبّته المستخدم في هذه المحادثة' : 'ذو صلة برسالتك'),
  };
}

export function getLinkedContextFor(entityType, entityId, { limit = 6 } = {}) {
  const links = getEntityLinks(entityType, entityId);
  const out = [];
  for (const l of links.slice(0, limit * 2)) {
    const isSource = l.source_type === entityType && l.source_id === String(entityId);
    const tType = isSource ? l.target_type : l.source_type;
    const tId = isSource ? l.target_id : l.source_id;
    const row = getEntityRow(tType, tId);
    const item = compactRow(row, tType, { why: `مرتبط (${l.relationship_type})` });
    if (item) out.push({ ...item, link_id: l.id });
  }
  return out.slice(0, limit);
}
