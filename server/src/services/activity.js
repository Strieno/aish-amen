import { all, get, run } from '../db/index.js';
import { uid, nowIso } from '../lib/util.js';

/**
 * Normalized activity/event index over all domains. Feeds the timeline,
 * recent-activity views, daily synthesis and AI retrieval. Canonical data
 * stays in its domain tables; this table is an index representation only.
 */
export function logActivity({ eventType, entityType, entityId, summary, metadata = {} }) {
  const id = uid('act-');
  run(
    'INSERT INTO activity_events(id, event_type, entity_type, entity_id, ts, summary, metadata) VALUES (?,?,?,?,?,?,?)',
    id,
    eventType,
    entityType || null,
    entityId || null,
    nowIso(),
    summary,
    JSON.stringify(metadata),
  );
  return id;
}

/**
 * Backfill the activity index from existing domain data. Idempotent per
 * (entity_type, entity_id, event_type) via a soft-dedupe check.
 */
export function backfillActivity({ days = 90 } = {}) {
  let added = 0;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const exists = (et, id, ev) =>
    !!get('SELECT id FROM activity_events WHERE entity_type = ? AND entity_id = ? AND event_type = ?', et, String(id), ev);

  for (const t of all("SELECT id, title, completed_at FROM tasks WHERE status = 'done' AND completed_at >= ?", since)) {
    if (!exists('task', t.id, 'TaskCompleted')) {
      logActivity({ eventType: 'TaskCompleted', entityType: 'task', entityId: t.id, summary: `أنجز مهمة: ${t.title}`, metadata: { ts: t.completed_at } });
      added += 1;
    }
  }
  for (const t of all('SELECT id, title, created_at FROM tasks WHERE created_at >= ?', since)) {
    if (!exists('task', t.id, 'TaskCreated')) {
      logActivity({ eventType: 'TaskCreated', entityType: 'task', entityId: t.id, summary: `أنشأ مهمة: ${t.title}`, metadata: { ts: t.created_at } });
      added += 1;
    }
  }
  for (const j of all('SELECT id, title, entry_date, created_at FROM journal_entries WHERE created_at >= ?', since)) {
    if (!exists('journal', j.id, 'JournalEntryCreated')) {
      logActivity({ eventType: 'JournalEntryCreated', entityType: 'journal', entityId: j.id, summary: `دّون في يومياته: ${j.title || 'بدون عنوان'}`, metadata: { ts: j.created_at } });
      added += 1;
    }
  }
  for (const c of all('SELECT id, entry_date, created_at FROM checkins WHERE created_at >= ?', since)) {
    if (!exists('checkin', c.id, 'CheckInCreated')) {
      logActivity({ eventType: 'CheckInCreated', entityType: 'checkin', entityId: c.id, summary: `سجّل حالته اليومية (${c.entry_date})`, metadata: { ts: c.created_at } });
      added += 1;
    }
  }
  for (const f of all('SELECT id, minutes, started_at, ended_at FROM focus_sessions WHERE completed = 1 AND started_at >= ?', since)) {
    if (!exists('focus_session', f.id, 'FocusSessionCompleted')) {
      logActivity({ eventType: 'FocusSessionCompleted', entityType: 'focus_session', entityId: f.id, summary: `أنهى جلسة تركيز ${f.minutes} دقيقة`, metadata: { ts: f.ended_at || f.started_at } });
      added += 1;
    }
  }
  for (const e of all('SELECT id, title, grade, course_id FROM exams WHERE grade IS NOT NULL')) {
    if (!exists('exam', e.id, 'ExamGradeRecorded')) {
      const course = e.course_id ? get('SELECT name FROM courses WHERE id = ?', e.course_id) : null;
      logActivity({ eventType: 'ExamGradeRecorded', entityType: 'exam', entityId: e.id, summary: `سجّل درجة ${e.title}${course ? ` (${course.name})` : ''}: ${e.grade}` });
      added += 1;
    }
  }
  for (const m of all('SELECT id, title, goal_id FROM goal_milestones WHERE done = 1')) {
    if (!exists('milestone', m.id, 'MilestoneCompleted')) {
      const goal = m.goal_id ? get('SELECT title FROM goals WHERE id = ?', m.goal_id) : null;
      logActivity({ eventType: 'MilestoneCompleted', entityType: 'milestone', entityId: m.id, summary: `أكمل مرحلة: ${m.title}${goal ? ` — ${goal.title}` : ''}` });
      added += 1;
    }
  }
  for (const w of all('SELECT id, title, created_at FROM work_notes WHERE created_at >= ?', since)) {
    if (!exists('work_note', w.id, 'WorkNoteCreated')) {
      logActivity({ eventType: 'WorkNoteCreated', entityType: 'work_note', entityId: w.id, summary: `أضاف ملاحظة عمل: ${w.title}`, metadata: { ts: w.created_at } });
      added += 1;
    }
  }
  for (const s of all('SELECT id, plan_id, activated_at FROM safe_living_sessions WHERE activated_at >= ?', since)) {
    if (!exists('safe_living_session', s.id, 'SafePlanActivated')) {
      const plan = s.plan_id ? get('SELECT name FROM safe_living_plans WHERE id = ?', s.plan_id) : null;
      logActivity({ eventType: 'SafePlanActivated', entityType: 'safe_living_plan', entityId: s.plan_id, summary: `فعّل خطة العيش الآمن: ${plan?.name || '—'}`, metadata: { ts: s.activated_at } });
      added += 1;
    }
  }
  for (const c of all('SELECT id, title, created_at FROM conversations WHERE created_at >= ?', since)) {
    if (!exists('conversation', c.id, 'ConversationCreated')) {
      logActivity({ eventType: 'ConversationCreated', entityType: 'conversation', entityId: c.id, summary: `بدأ محادثة: ${c.title || '…'}`, metadata: { ts: c.created_at } });
      added += 1;
    }
  }
  for (const g of all('SELECT id, title, created_at FROM goals WHERE created_at >= ?', since)) {
    if (!exists('goal', g.id, 'GoalProgressChanged')) {
      logActivity({ eventType: 'GoalProgressChanged', entityType: 'goal', entityId: g.id, summary: `هدف جديد: ${g.title}`, metadata: { ts: g.created_at } });
      added += 1;
    }
  }
  return { added };
}

/**
 * Unified cross-domain timeline from the activity index.
 * Returns chronological (newest first) events with domain filters.
 */
export function getTimeline({ days = 30, domains = [], limit = 200 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const where = ['ts >= ?'];
  const params = [since];
  const domainMap = {
    conversations: ['ConversationCreated', 'ConversationMessageCreated'],
    tasks: ['TaskCreated', 'TaskCompleted'],
    journal: ['JournalEntryCreated'],
    checkins: ['CheckInCreated'],
    focus: ['FocusSessionCompleted'],
    study: ['ExamGradeRecorded'],
    goals: ['MilestoneCompleted', 'GoalProgressChanged'],
    work: ['WorkNoteCreated'],
    safe: ['SafePlanActivated'],
    memories: ['MemoryCreated'],
  };
  const types = [];
  for (const d of domains) {
    if (domainMap[d]) types.push(...domainMap[d]);
  }
  if (types.length) {
    where.push(`event_type IN (${types.map(() => '?').join(',')})`);
    params.push(...types);
  }
  const rows = all(
    `SELECT * FROM activity_events WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT ?`,
    ...params,
    limit,
  );
  return rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

export function getRecentActivity({ limit = 12 } = {}) {
  return getTimeline({ days: 30, limit });
}

export function getEntityActivity(entityType, entityId, { limit = 20 } = {}) {
  return all(
    'SELECT * FROM activity_events WHERE entity_type = ? AND entity_id = ? ORDER BY ts DESC LIMIT ?',
    entityType,
    String(entityId),
    limit,
  ).map((r) => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}
