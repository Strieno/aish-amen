/**
 * ACE — Aish Aman Context Engine (main entry).
 *
 *   UserMessage → detectIntent → route → collect → score → dedupe/aggregate
 *   → assemble ContextPacket → serialize (injection-safe) → AI
 *
 * Server-side only. Fails gracefully: callers keep the existing pipeline when
 * build() throws.
 */

import { getAiPermissions } from '../life-context.js';
import { getSetting } from '../settings.js';
import { onAnyDomainEvent } from '../events.js';
import { estimateTokens } from '../../lib/util.js';
import { detectIntent, detectIntentHybrid } from './intent.js';
import { INTENT_ROUTES, getRoute } from './router.js';
import { collectContext } from './collector.js';
import { scoreItems } from './scorer.js';
import { deduplicate, aggregateFocus, applyBudget, serializePacket, serializeDebug } from './compressor.js';

const CACHE_TTL_MS = 15000;

let lastPacket = null;
let lastError = null;

// In-memory packet cache per userId|intent|mode. Invalidated on any domain event.
const cache = new Map();
export function invalidateAceCache() {
  cache.clear();
}
onAnyDomainEvent(() => invalidateAceCache());

function budget() {
  return Number(getSetting('ai')?.contextBudget?.ace ?? getSetting('ai')?.aceBudget ?? 1000);
}

/**
 * Build a ContextPacket for a user message (synchronous, keyword intent).
 * @param {{ userId?: string, message?: string, mode?: string, permissions?: object, debug?: boolean, useCache?: boolean }} opts
 * @returns {import('./types.js').ContextPacket}
 */
export function buildContextPacket({ userId = 'local', message = '', mode = 'general', permissions = null, debug = false, useCache = true } = {}) {
  const started = Date.now();
  const now = new Date();

  const { intent, confidence, signals } = detectIntent(message, { mode });
  const route = getRoute(intent);

  const cacheKey = `${userId}|${intent}|${mode}`;
  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit && now.getTime() - hit.at < CACHE_TTL_MS) {
      return { ...hit.packet, fromCache: true };
    }
  }

  const perms = permissions || getAiPermissions().read;
  const rawCandidates = collectContext({ intent, message, now, route, permissions: perms });
  const scored = scoreItems({ items: rawCandidates, query: message, now });
  const deduped = deduplicate(scored);
  const aggregated = aggregateFocus(deduped, { now, intent });

  const packet = assemblePacket({ intent, confidence, signals, route, scored: aggregated, message, now });
  packet.metadata = {
    generatedAt: now.toISOString(),
    candidateCount: rawCandidates.length,
    selectedCount: countSelected(packet),
    estimatedTokens: estimateTokens(serializePacket(packet)),
    intent,
    intentConfidence: confidence,
    buildTimeMs: Date.now() - started,
    signals,
  };

  // Enforce the token budget by trimming lowest-priority sections.
  enforceBudget(packet, budget());

  lastPacket = packet;
  if (useCache) cache.set(cacheKey, { at: Date.now(), packet });

  return debug ? { ...packet, debugText: serializeDebug(packet) } : packet;
}

/**
 * Async hybrid build (optional AI intent classification) — used by the ACE
 * inspector and any future "smart" entry points.
 * @returns {Promise<import('./types.js').ContextPacket>}
 */
export async function buildContextPacketHybrid({ userId = 'local', message = '', mode = 'general', permissions = null, debug = false, useCache = false } = {}) {
  const started = Date.now();
  const now = new Date();
  const { intent, confidence, signals } = await detectIntentHybrid(message, { mode });
  const route = getRoute(intent);
  const perms = permissions || getAiPermissions().read;
  const rawCandidates = collectContext({ intent, message, now, route, permissions: perms });
  const scored = scoreItems({ items: rawCandidates, query: message, now });
  const deduped = deduplicate(scored);
  const aggregated = aggregateFocus(deduped, { now, intent });
  const packet = assemblePacket({ intent, confidence, signals, route, scored: aggregated, message, now });
  packet.metadata = {
    generatedAt: now.toISOString(),
    candidateCount: rawCandidates.length,
    selectedCount: countSelected(packet),
    estimatedTokens: estimateTokens(serializePacket(packet)),
    intent,
    intentConfidence: confidence,
    buildTimeMs: Date.now() - started,
    signals,
  };
  enforceBudget(packet, budget());
  lastPacket = packet;
  return debug ? { ...packet, debugText: serializeDebug(packet) } : packet;
}

/** Return the last built packet (non-sensitive summary for the inspector). */
export function getLastPacket() {
  return lastPacket;
}

export function getAceStatus() {
  return {
    enabled: true,
    intentCount: INTENT_ROUTES ? Object.keys(INTENT_ROUTES).length : 0,
    budget: budget(),
    lastError,
    last: lastPacket
      ? {
          intent: lastPacket.intent,
          confidence: lastPacket.metadata?.intentConfidence,
          candidateCount: lastPacket.metadata?.candidateCount,
          selectedCount: lastPacket.metadata?.selectedCount,
          estimatedTokens: lastPacket.metadata?.estimatedTokens,
          buildTimeMs: lastPacket.metadata?.buildTimeMs,
        }
      : null,
  };
}

/**
 * Reusable daily context for future Daily Brief features.
 * @returns {{ packet: object, summary: object }}
 */
export function buildDailyContext(userId = 'local') {
  const packet = buildContextPacket({ userId, message: '', mode: 'planning', useCache: false });
  const summary = {
    intent: 'planning',
    topTask: packet.importantTasks?.[0]?.text || null,
    topGoal: packet.activeGoals?.[0]?.text || null,
    focusMinutes: packet.recentEvents?.find((e) => e.source === 'focus')?.text || null,
    risks: (packet.risks || []).map((r) => r.label),
  };
  return { packet, summary };
}

/* ---------------- packet assembly ---------------- */

function countSelected(packet) {
  return (
    packet.currentContext.length +
    packet.relevantMemories.length +
    packet.activeGoals.length +
    packet.importantTasks.length +
    packet.recentEvents.length
  );
}

function assemblePacket({ intent, confidence, signals, route, scored, message, now }) {
  const items = scored.map((s) => ({ ...s.item, score: Number(s.item.score.toFixed(2)) }));

  const memories = [];
  const goals = [];
  const tasks = [];
  const focusEvents = [];
  const checkinEvents = [];
  const other = [];

  for (const it of items) {
    if (it.source === 'memory') memories.push(it);
    else if (it.source === 'goal') goals.push(it);
    else if (it.source === 'task') tasks.push(it);
    else if (it.source === 'focus') focusEvents.push(it);
    else if (it.source === 'checkin') checkinEvents.push(it);
    else other.push(it);
  }

  return {
    intent,
    currentContext: other.sort((a, b) => b.score - a.score).slice(0, 8),
    relevantMemories: memories.sort((a, b) => b.score - a.score).slice(0, 6),
    activeGoals: goals.sort((a, b) => b.score - a.score).slice(0, 5),
    importantTasks: tasks.sort((a, b) => b.score - a.score).slice(0, 8),
    recentEvents: [...focusEvents.sort((a, b) => b.score - a.score).slice(0, 2), ...checkinEvents.sort((a, b) => b.score - a.score).slice(0, 2)],
    detectedPatterns: detectPatterns({ tasks, goals, focusEvents, checkinEvents, memories, now }),
    risks: detectRisks({ tasks, goals, focusEvents, checkinEvents, memories, activePlan: other.find((i) => i.source === 'safe_living'), now }),
    recommendedFocus: recommendFocus({ tasks, goals }),
    assistantGuidance: route.guidance || '',
    metadata: { intent, intentConfidence: confidence, signals, generatedAt: now.toISOString(), candidateCount: 0, selectedCount: 0, estimatedTokens: 0, buildTimeMs: 0 },
  };
}

/* ---------------- deterministic patterns & risks ---------------- */

function detectPatterns({ focusEvents, checkinEvents, goals, now }) {
  const patterns = [];

  const focusMinutes = focusEvents.reduce((sum, i) => sum + (Number(i.metadata?.minutes) || 0), 0);
  const focusDays = new Set(focusEvents.map((i) => (i.createdAt || '').slice(0, 10))).size;
  if (focusMinutes > 0 && focusDays > 0) {
    patterns.push({ label: `ركز ${Math.round(focusMinutes)} دقيقة في آخر ${focusDays} ${focusDays === 1 ? 'يوم' : 'أيام'}`, evidence: `${focusEvents.length} جلسة`, confidence: 0.7 });
  }

  const lastCheckin = checkinEvents[0]?.createdAt;
  if (lastCheckin) {
    const days = Math.round((now.getTime() - new Date(lastCheckin).getTime()) / 86400000);
    patterns.push({ label: `آخر تسجيل حالة قبل ${days === 0 ? 'اليوم' : `${days} ${days === 1 ? 'يوم' : 'أيام'}`}`, evidence: lastCheckin, confidence: 0.6 });
  }

  const nearlyDone = goals.find((g) => Number(g.metadata?.progress) >= 0.75);
  if (nearlyDone) {
    patterns.push({ label: `قريب من إكمال هدف «${(nearlyDone.text || '').slice(0, 40)}»`, evidence: `تقدم ${Math.round(Number(nearlyDone.metadata.progress) * 100)}%`, confidence: 0.8 });
  }

  return patterns;
}

function detectRisks({ tasks, goals, checkinEvents, activePlan, now }) {
  const risks = [];
  const inDays = (date, n) => date && (new Date(date).getTime() - now.getTime()) / 86400000 <= n;

  for (const t of tasks) {
    const due = t.metadata?.due_date;
    if (due && t.metadata?.priority === 'high' && inDays(due, 0)) {
      risks.push({ label: `مهمة مستعجلة متأخرة: «${(t.text || '').slice(0, 40)}»`, detail: due, severity: 'high', source: 'task' });
    } else if (due && inDays(due, 3)) {
      risks.push({ label: `مهمة مستحقة قريبًا: «${(t.text || '').slice(0, 40)}»`, detail: due, severity: 'medium', source: 'task' });
    }
  }

  for (const e of tasks.concat([]).filter((t) => t.source === 'study' && t.metadata?.exam_date)) {
    if (inDays(e.metadata.exam_date, 3)) {
      risks.push({ label: `امتحان بعد ${Math.max(0, Math.round((new Date(e.metadata.exam_date).getTime() - now.getTime()) / 86400000))} يوم`, detail: e.metadata.exam_date, severity: 'medium', source: 'study' });
    }
  }

  if (activePlan) risks.push({ label: 'خطة عيش آمن نشطة — كن لطيفًا ومطمئنًا', detail: (activePlan.text || '').slice(0, 60), severity: 'medium', source: 'safe_living' });

  const lastCheckin = checkinEvents[0]?.createdAt;
  if (lastCheckin) {
    const days = Math.round((now.getTime() - new Date(lastCheckin).getTime()) / 86400000);
    if (days > 5) risks.push({ label: 'لم يسجل المستخدم حالته منذ أيام', detail: `${days} يوم`, severity: 'low', source: 'checkin' });
  }

  return risks.slice(0, 4);
}

function recommendFocus({ tasks, goals }) {
  const urgent = tasks.find((t) => t.metadata?.due_date && (new Date(t.metadata.due_date).getTime() - Date.now()) / 86400000 <= 3);
  if (urgent) return `ابدأ بمهمة «${(urgent.text || '').split('—')[0].trim().slice(0, 50)}» فهي مستحقة قريبًا.`;
  if (tasks.length) return `ركّز على المهمة الأهم: «${(tasks[0].text || '').split('—')[0].trim().slice(0, 50)}».`;
  if (goals.length) return `خطوة صغيرة الآن نحو هدف «${(goals[0].text || '').slice(0, 50)}».`;
  return 'ركّز على أهم شيء مفتوح الآن بخطوة صغيرة واضحة.';
}

/** Trim sections from lowest priority until the serialized packet fits the budget. */
function enforceBudget(packet, budget) {
  const priority = ['recentEvents', 'currentContext', 'relevantMemories', 'importantTasks', 'activeGoals'];
  while (estimateTokens(serializePacket(packet)) > budget) {
    let trimmed = false;
    for (const key of priority) {
      if (packet[key].length > 0) {
        packet[key].pop();
        trimmed = true;
        break;
      }
    }
    if (!trimmed) break;
  }
  packet.metadata.estimatedTokens = estimateTokens(serializePacket(packet));
}
