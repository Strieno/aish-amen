import { all, get, run, transaction, rebuildFts } from '../db/index.js';
import { uid, nowIso, parseJson, ftsQuery } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from './events.js';

const TYPE_DEFAULT = 'general';

function rowToMemory(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseJson(row.tags, []),
    importance: Number(row.importance),
    confidence: Number(row.confidence),
    pinned: !!row.pinned,
    archived: !!row.archived,
    ai_access: !!row.ai_access,
  };
}

export function createMemory({
  content,
  type = TYPE_DEFAULT,
  importance = 0.5,
  source = 'user',
  sourceType = null,
  sourceId = null,
  confidence = 0.5,
  tags = [],
  pinned = false,
  aiAccess = true,
}) {
  const id = uid('mem-');
  run(
    `INSERT INTO memories(id, content, type, importance, source, source_type, source_id, confidence, tags, pinned, archived, ai_access)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    content.trim(),
    type,
    importance,
    source,
    sourceType,
    sourceId,
    confidence,
    JSON.stringify(tags),
    pinned ? 1 : 0,
    0,
    aiAccess ? 1 : 0,
  );
  for (const tag of tags) {
    run('INSERT OR IGNORE INTO memory_tags(memory_id, tag) VALUES (?,?)', id, tag);
  }
  rebuildFts();
  emitDomainEvent(EVENT_TYPES.MEMORY_CREATED, { entityType: 'memory', entityId: id, summary: content.trim().slice(0, 80) });
  return getMemory(id);
}

/**
 * Rule-based memory harvesting from any domain event (task completed,
 * check-in saved, milestone done, focus finished, exam graded, plan activated).
 * Deduplicates on (source_type, source_id) so re-running is safe.
 */
export function harvestMemory({ sourceType, sourceId, content, type = 'episodic', importance = 0.4, source = sourceType, tags = [], aiAccess = true }) {
  if (!content || !content.trim()) return null;
  if (sourceType && sourceId) {
    const exists = get('SELECT id FROM memories WHERE source_type = ? AND source_id = ?', sourceType, String(sourceId));
    if (exists) return null;
  } else {
    const exists = get('SELECT id FROM memories WHERE content = ?', content.trim());
    if (exists) return null;
  }
  return createMemory({ content, type, importance, source, sourceType, sourceId, tags, aiAccess });
}

/**
 * Catch-up harvest: scans the last N days of app activity and creates the
 * missing memories. Safe to run on every launch or from the Memory page.
 */
export function catchUpHarvest({ days = 7 } = {}) {
  let added = 0;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Completed tasks
  for (const t of all("SELECT id, title FROM tasks WHERE status = 'done' AND completed_at >= ?", since)) {
    if (harvestMemory({ sourceType: 'task', sourceId: t.id, content: `أنجزت مهمة: ${t.title}`, importance: 0.45, tags: ['task'] })) added += 1;
  }
  // Check-ins
  for (const c of all('SELECT entry_date, energy, stress, sleep_hours FROM checkins WHERE created_at >= ?', since)) {
    const parts = [];
    if (c.energy != null) parts.push(`طاقة ${c.energy}/5`);
    if (c.stress != null) parts.push(`ضغط ${c.stress}/5`);
    if (c.sleep_hours != null) parts.push(`نوم ${c.sleep_hours} ساعات`);
    if (parts.length) {
      if (harvestMemory({ sourceType: 'checkin', sourceId: c.entry_date, content: `تسجيل يوم ${c.entry_date}: ${parts.join('، ')}`, importance: 0.3, tags: ['checkin'] })) added += 1;
    }
  }
  // Completed milestones
  for (const m of all('SELECT id, title, goal_id FROM goal_milestones WHERE done = 1') ) {
    const goal = m.goal_id ? get('SELECT title FROM goals WHERE id = ?', m.goal_id) : null;
    if (harvestMemory({ sourceType: 'milestone', sourceId: m.id, content: `أنجزت مرحلة: ${m.title}${goal ? ` — ${goal.title}` : ''}`, importance: 0.5, tags: ['goal'] })) added += 1;
  }
  // Completed focus sessions
  for (const f of all('SELECT id, minutes, started_at FROM focus_sessions WHERE completed = 1 AND started_at >= ?', since)) {
    if (harvestMemory({ sourceType: 'focus', sourceId: f.id, content: `جلسة تركيز ${f.minutes} دقيقة (${f.started_at.slice(0, 10)})`, importance: 0.25, tags: ['focus'] })) added += 1;
  }
  // Graded exams
  for (const e of all('SELECT id, title, grade, course_id FROM exams WHERE grade IS NOT NULL')) {
    const course = e.course_id ? get('SELECT name FROM courses WHERE id = ?', e.course_id) : null;
    if (harvestMemory({ sourceType: 'exam', sourceId: e.id, content: `درجة ${e.title}${course ? ` (${course.name})` : ''}: ${e.grade}`, importance: 0.55, tags: ['study'] })) added += 1;
  }
  // Safe-living plan activations
  for (const s of all('SELECT id, plan_id, activated_at FROM safe_living_sessions WHERE activated_at >= ?', since)) {
    const plan = s.plan_id ? get('SELECT name FROM safe_living_plans WHERE id = ?', s.plan_id) : null;
    if (plan && harvestMemory({ sourceType: 'safe-plan', sourceId: s.id, content: `فُعّلت خطة العيش الآمن: ${plan.name}`, importance: 0.4, tags: ['safe'] })) added += 1;
  }
  // Journal entries (only those the user allows AI to read)
  for (const j of all('SELECT id, title, entry_date FROM journal_entries WHERE ai_access = 1 AND created_at >= ?', since)) {
    if (harvestMemory({ sourceType: 'journal', sourceId: j.id, content: `يوميات ${j.entry_date}: ${j.title || 'بدون عنوان'}`, importance: 0.3, tags: ['journal'] })) added += 1;
  }
  // Work notes (low importance)
  for (const w of all('SELECT id, title FROM work_notes WHERE created_at >= ?', since)) {
    if (harvestMemory({ sourceType: 'work-note', sourceId: w.id, content: `ملاحظة عمل: ${w.title}`, importance: 0.2, tags: ['work'] })) added += 1;
  }

  rebuildFts();
  return { added };
}

/** Resolve a memory's source entity into a human-friendly label + route. */
export function sourceInfo(memory) {
  if (!memory.source_type || !memory.source_id) return null;
  const t = memory.source_type;
  const id = memory.source_id;
  switch (t) {
    case 'task': {
      const row = get('SELECT title FROM tasks WHERE id = ?', id);
      return row ? { label: `مهمة: ${row.title}`, kind: 'task' } : null;
    }
    case 'checkin': {
      return { label: `تسجيل ${id}`, kind: 'checkin' };
    }
    case 'milestone': {
      const row = get('SELECT title FROM goal_milestones WHERE id = ?', id);
      return row ? { label: `مرحلة: ${row.title}`, kind: 'goal' } : null;
    }
    case 'focus': {
      return { label: 'جلسة تركيز', kind: 'focus' };
    }
    case 'exam': {
      const row = get('SELECT title FROM exams WHERE id = ?', id);
      return row ? { label: `امتحان: ${row.title}`, kind: 'study' } : null;
    }
    case 'safe-plan': {
      const row = get('SELECT name FROM safe_living_plans WHERE id = ?', id);
      return row ? { label: `خطة: ${row.name}`, kind: 'safe' } : null;
    }
    case 'journal': {
      const row = get('SELECT title FROM journal_entries WHERE id = ?', id);
      return row ? { label: `يوميات: ${row.title || id}`, kind: 'journal' } : null;
    }
    case 'work-note': {
      const row = get('SELECT title FROM work_notes WHERE id = ?', id);
      return row ? { label: `ملاحظة عمل: ${row.title}`, kind: 'work' } : null;
    }
    default:
      return null;
  }
}

export function getMemory(id) {
  return rowToMemory(get('SELECT * FROM memories WHERE id = ?', id));
}

export function listMemories({ query, type, pinned, archived = false, limit = 100, sourceType } = {}) {
  const where = [];
  const params = [];
  if (type && type !== 'all') {
    where.push('type = ?');
    params.push(type);
  }
  if (sourceType && sourceType !== 'all') {
    if (sourceType === 'user') where.push('source_type IS NULL AND source = ?');
    else if (sourceType === 'chat') where.push("source_type IS NULL AND source = 'conversation'");
    else where.push('source_type = ?');
    params.push(sourceType === 'user' ? 'user' : sourceType === 'chat' ? 'conversation' : sourceType);
  }
  if (pinned) {
    where.push('pinned = 1');
  } else if (archived) {
    where.push('archived = 1');
  } else {
    where.push('archived = 0');
  }
  const sql =
    `SELECT * FROM memories WHERE ${where.length ? where.join(' AND ') : '1=1'}` +
    (query
      ? ' AND content LIKE ?'
      : '') +
    ' ORDER BY pinned DESC, importance DESC, updated_at DESC LIMIT ?';
  if (query) params.push(`%${query}%`);
  params.push(limit);
  return all(sql, ...params).map(rowToMemory);
}

/**
 * Hybrid memory retrieval: FTS5 keyword score + recency + importance.
 * Returns ranked memories, respecting ai_access and archive flags.
 */
/**
 * Hybrid memory retrieval: FTS5 keyword score + LIKE substring fallback
 * (important for Arabic affixes: "بالعربية" contains "العربية").
 * Returns ranked memories, respecting ai_access and archive flags.
 */
export function searchMemories(query, { limit = 8, type, aiAccess = true } = {}) {
  if (!query || !query.trim()) return listMemories({ type, limit });
  const match = ftsQuery(query);
  const ftsResults = [];
  if (match) {
    const rows = all(
      `SELECT m.*,
              bm25(memory_fts) AS fts_score,
              (julianday('now') - julianday(m.updated_at)) AS age_days
       FROM memory_fts
       JOIN memories m ON m.id = memory_fts.memory_id
       WHERE memory_fts MATCH ?
         AND m.archived = 0
         ${aiAccess ? 'AND m.ai_access = 1' : ''}
         ${type && type !== 'all' ? 'AND m.type = ?' : ''}
       ORDER BY m.pinned DESC, fts_score ASC, m.importance DESC
       LIMIT ?`,
      match,
      ...(type && type !== 'all' ? [type] : []),
      limit,
    );
    const ranked = rows.map((r) => {
      const fts = r.fts_score;
      const score = -fts * 2.0 + Number(r.importance) * 1.0 + Math.max(0, 1 - (r.age_days || 30) / 30) * 0.5;
      return { memory: rowToMemory(r), score };
    });
    ranked.sort((a, b) => b.score - a.score);
    ftsResults.push(...ranked);
  }

  // LIKE fallback for substring matches (Arabic affixes, partial words).
  const tokens = String(query).split(/\s+/).filter((t) => t.length > 2).slice(0, 4);
  const likeRows = all(
    `SELECT * FROM memories
     WHERE archived = 0
       ${aiAccess ? 'AND ai_access = 1' : ''}
       ${type && type !== 'all' ? 'AND type = ?' : ''}
       AND (${tokens.map(() => 'content LIKE ?').join(' OR ')})
     ORDER BY pinned DESC, importance DESC, updated_at DESC
     LIMIT ?`,
    ...(type && type !== 'all' ? [type] : []),
    ...tokens.map((t) => `%${t}%`),
    limit,
  );

  const seen = new Set(ftsResults.map((r) => r.memory.id));
  const merged = ftsResults.map((r) => r.memory);
  for (const row of likeRows) {
    const m = rowToMemory(row);
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  return merged.slice(0, limit);
}

export function updateMemory(id, patch) {
  const existing = getMemory(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  run(
    `UPDATE memories SET content=?, type=?, importance=?, source=?, confidence=?, tags=?, pinned=?, archived=?, ai_access=?, updated_at=?
     WHERE id=?`,
    next.content,
    next.type,
    Number(next.importance),
    next.source,
    Number(next.confidence),
    JSON.stringify(next.tags || []),
    next.pinned ? 1 : 0,
    next.archived ? 1 : 0,
    next.ai_access ? 1 : 0,
    nowIso(),
    id,
  );
  transaction(() => {
    run('DELETE FROM memory_tags WHERE memory_id = ?', id);
    for (const tag of next.tags || []) {
      run('INSERT OR IGNORE INTO memory_tags(memory_id, tag) VALUES (?,?)', id, tag);
    }
  });
  rebuildFts();
  return getMemory(id);
}

export function deleteMemory(id) {
  run('DELETE FROM memories WHERE id = ?', id);
  rebuildFts();
}

export function deleteAllMemories() {
  run('DELETE FROM memories');
  rebuildFts();
}

export function memoryTypes() {
  return all('SELECT DISTINCT type FROM memories WHERE archived = 0 ORDER BY type').map((r) => r.type);
}

export function memorySourceTypes() {
  return all('SELECT DISTINCT source_type FROM memories WHERE archived = 0 AND source_type IS NOT NULL ORDER BY source_type').map((r) => r.source_type);
}
