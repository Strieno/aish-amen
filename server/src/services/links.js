import { all, get, run } from '../db/index.js';
import { uid, nowIso } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from './events.js';

const ENTITY_LABELS = {
  conversation: 'محادثة',
  message: 'رسالة',
  memory: 'ذاكرة',
  task: 'مهمة',
  journal: 'يوميات',
  checkin: 'تسجيل',
  goal: 'هدف',
  milestone: 'مرحلة',
  focus_session: 'جلسة تركيز',
  course: 'مادة',
  exam: 'امتحان',
  work_note: 'ملاحظة عمل',
  safe_living_plan: 'خطة عيش آمن',
  document: 'مستند',
};

export function entityLabel(type) {
  return ENTITY_LABELS[type] || type;
}

/** Create a link between two entities. Deduplicated by the unique index. */
export function createLink({ sourceType, sourceId, targetType, targetId, relationshipType = 'related_to', confidence = 1, createdBy = 'user', metadata = {} }) {
  if (!sourceType || !sourceId || !targetType || !targetId) return null;
  if (sourceType === targetType && sourceId === targetId) return null;
  const id = uid('link-');
  const inserted = run(
    `INSERT OR IGNORE INTO entity_links(id, source_type, source_id, target_type, target_id, relationship_type, confidence, created_by, metadata, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id,
    sourceType,
    String(sourceId),
    targetType,
    String(targetId),
    relationshipType,
    confidence,
    createdBy,
    JSON.stringify(metadata),
    nowIso(),
  );
  if (inserted.changes === 0) return null;
  emitDomainEvent(EVENT_TYPES.LINK_CREATED, {
    entityType: 'link',
    entityId: id,
    summary: `رابط جديد: ${entityLabel(sourceType)} ↔ ${entityLabel(targetType)}`,
    metadata: { source_type: sourceType, target_type: targetType, created_by: createdBy },
  });
  return { id, sourceType, sourceId, targetType, targetId, relationshipType, confidence, createdBy };
}

export function removeLink(id) {
  run('DELETE FROM entity_links WHERE id = ?', id);
  emitDomainEvent(EVENT_TYPES.LINK_REMOVED, { entityType: 'link', entityId: id, summary: 'أُزيل رابط' });
}

export function removeLinkBetween(sourceType, sourceId, targetType, targetId) {
  run(
    'DELETE FROM entity_links WHERE source_type=? AND source_id=? AND target_type=? AND target_id=?',
    sourceType, String(sourceId), targetType, String(targetId),
  );
}

/** All links touching an entity (both directions). */
export function getEntityLinks(entityType, entityId) {
  return all(
    `SELECT * FROM entity_links
     WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)
     ORDER BY confidence DESC, created_at DESC`,
    entityType, String(entityId), entityType, String(entityId),
  ).map((r) => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

function titleFor(type, id) {
  if (!id) return null;
  switch (type) {
    case 'task': return get('SELECT title FROM tasks WHERE id = ?', String(id))?.title;
    case 'journal': return get('SELECT title, entry_date FROM journal_entries WHERE id = ?', String(id))?.title;
    case 'goal': return get('SELECT title FROM goals WHERE id = ?', String(id))?.title;
    case 'milestone': return get('SELECT title FROM goal_milestones WHERE id = ?', String(id))?.title;
    case 'course': return get('SELECT name FROM courses WHERE id = ?', String(id))?.name;
    case 'exam': return get('SELECT title FROM exams WHERE id = ?', String(id))?.title;
    case 'checkin': return get('SELECT entry_date FROM checkins WHERE id = ?', String(id))?.entry_date;
    case 'focus_session': return get('SELECT minutes, started_at FROM focus_sessions WHERE id = ?', String(id))?.minutes;
    case 'work_note': return get('SELECT title FROM work_notes WHERE id = ?', String(id))?.title;
    case 'safe_living_plan': return get('SELECT name FROM safe_living_plans WHERE id = ?', String(id))?.name;
    case 'conversation': return get('SELECT title FROM conversations WHERE id = ?', String(id))?.title;
    case 'memory': return get('SELECT content FROM memories WHERE id = ?', String(id))?.content?.slice(0, 60);
    case 'document': return get('SELECT filename FROM documents WHERE id = ?', String(id))?.filename;
    default: return null;
  }
}

/** Resolve linked entities into display-ready cards with relationship info. */
export function relatedEntities(entityType, entityId, { limit = 12 } = {}) {
  const links = getEntityLinks(entityType, entityId);
  const out = [];
  const seen = new Set();
  for (const l of links) {
    const isSource = l.source_type === entityType && l.source_id === String(entityId);
    const tType = isSource ? l.target_type : l.source_type;
    const tId = isSource ? l.target_id : l.source_id;
    const key = `${tType}:${tId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = titleFor(tType, tId);
    if (!title) continue;
    out.push({
      link_id: l.id,
      type: tType,
      id: tId,
      title: typeof title === 'object' ? String(Object.values(title)[0] ?? tId) : String(title),
      relationship_type: l.relationship_type,
      confidence: l.confidence,
      created_by: l.created_by,
      direction: isSource ? 'out' : 'in',
    });
  }
  return out.slice(0, limit);
}

/* ---------------- Rule-based relationship discovery ---------------- */

/**
 * Find candidate links for an entity using deterministic name/keyword
 * overlap across domains. High-confidence candidates are auto-created;
 * the rest are stored as suggestions for user approval.
 */
export function suggestLinksForEntity(entityType, entityId) {
  const text = discoverableText(entityType, entityId);
  if (!text) return { created: [], suggested: [] };
  const created = [];
  const suggested = [];

  const check = (tType, row, matchScore) => {
    if (!row) return;
    if (tType === entityType && row.id === String(entityId)) return;
    const confidence = Math.min(1, 0.5 + matchScore * 0.25);
    const existing = get(
      `SELECT id FROM entity_links WHERE
       ((source_type=? AND source_id=? AND target_type=? AND target_id=?)
        OR (source_type=? AND source_id=? AND target_type=? AND target_id=?))`,
      entityType, String(entityId), tType, row.id,
      tType, row.id, entityType, String(entityId),
    );
    if (existing) return;
    const existingSuggestion = get(
      'SELECT id FROM link_suggestions WHERE source_type=? AND source_id=? AND target_type=? AND target_id=?',
      entityType, String(entityId), tType, row.id,
    );
    if (existingSuggestion) return;
    if (confidence >= 0.75) {
      const link = createLink({
        sourceType: entityType, sourceId: entityId, targetType: tType, targetId: row.id,
        relationshipType: 'related_to', confidence, createdBy: 'auto',
        metadata: { reason: 'keyword-overlap' },
      });
      if (link) created.push({ type: tType, id: row.id, confidence });
    } else {
      run(
        'INSERT INTO link_suggestions(id, source_type, source_id, target_type, target_id, relationship_type, confidence, reason) VALUES (?,?,?,?,?,?,?,?)',
        uid('ls-'), entityType, String(entityId), tType, row.id, 'related_to', confidence,
        `تداخل في الكلمات: "${row.title}"`,
      );
      suggested.push({ type: tType, id: row.id, title: row.title, confidence, reason: `تداخل في الكلمات مع "${text.title}"` });
    }
  };

  // Courses: match name/keywords
  for (const c of all('SELECT id, name, code FROM courses')) {
    const score = overlapScore(text.all, `${c.name} ${c.code || ''}`);
    if (score >= 1) check('course', { id: c.id, title: c.name }, score);
  }
  // Exams
  for (const e of all('SELECT id, title FROM exams')) {
    const score = overlapScore(text.all, e.title);
    if (score >= 1) check('exam', { id: e.id, title: e.title }, score);
  }
  // Goals
  for (const g of all("SELECT id, title FROM goals WHERE status = 'active'")) {
    const score = overlapScore(text.all, g.title);
    if (score >= 1) check('goal', { id: g.id, title: g.title }, score);
  }
  // Open tasks (titles are short — require a stronger match)
  for (const t of all("SELECT id, title FROM tasks WHERE status NOT IN ('done','cancelled')")) {
    const score = overlapScore(text.all, t.title);
    if (score >= 2) check('task', { id: t.id, title: t.title }, score);
  }
  // Safe plans
  for (const p of all('SELECT id, name FROM safe_living_plans')) {
    const score = overlapScore(text.all, p.name);
    if (score >= 1) check('safe_living_plan', { id: p.id, title: p.name }, score);
  }
  // Work notes
  for (const w of all('SELECT id, title FROM work_notes')) {
    const score = overlapScore(text.all, w.title);
    if (score >= 1) check('work_note', { id: w.id, title: w.title }, score);
  }

  return { created, suggested };
}

function discoverableText(entityType, entityId) {
  let title = '';
  let body = '';
  switch (entityType) {
    case 'task': {
      const r = get('SELECT title, description, notes FROM tasks WHERE id = ?', String(entityId));
      if (!r) return null;
      title = r.title;
      body = `${r.description || ''} ${r.notes || ''}`;
      break;
    }
    case 'journal': {
      const r = get('SELECT title, content FROM journal_entries WHERE id = ?', String(entityId));
      if (!r) return null;
      title = r.title || '';
      body = r.content || '';
      break;
    }
    case 'exam': {
      const r = get('SELECT title, notes FROM exams WHERE id = ?', String(entityId));
      if (!r) return null;
      title = r.title;
      body = r.notes || '';
      break;
    }
    case 'goal': {
      const r = get('SELECT title, notes FROM goals WHERE id = ?', String(entityId));
      if (!r) return null;
      title = r.title;
      body = r.notes || '';
      break;
    }
    case 'work_note': {
      const r = get('SELECT title, content FROM work_notes WHERE id = ?', String(entityId));
      if (!r) return null;
      title = r.title;
      body = r.content || '';
      break;
    }
    case 'course': {
      const r = get('SELECT name, code, notes FROM courses WHERE id = ?', String(entityId));
      if (!r) return null;
      title = `${r.name} ${r.code || ''}`;
      body = r.notes || '';
      break;
    }
    case 'conversation': {
      const r = get('SELECT title FROM conversations WHERE id = ?', String(entityId));
      if (!r) return null;
      title = r.title;
      const msgs = all('SELECT content FROM messages WHERE conversation_id = ? LIMIT 10', String(entityId));
      body = msgs.map((m) => m.content).join(' ');
      break;
    }
    default:
      return null;
  }
  return { title, all: `${title} ${body}` };
}

/** Word-overlap score tolerant to Arabic affixes ("الاختبار" ⊃ "اختبار"). */
export function overlapScore(textA, textB) {
  if (!textA || !textB) return 0;
  const tokens = (s) => {
    const t = String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
    return [...new Set(t.split(/\s+/).filter((w) => w.length > 2))];
  };
  const a = tokens(textA);
  const b = tokens(textB);
  let score = 0;
  for (const w of b) {
    for (const x of a) {
      if (w === x || (w.length >= 4 && (x.includes(w) || w.includes(x)))) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

/* ---------------- Suggestions CRUD ---------------- */

export function listLinkSuggestions({ status = 'pending', limit = 30 } = {}) {
  return all('SELECT * FROM link_suggestions WHERE status = ? ORDER BY created_at DESC LIMIT ?', status, limit).map((s) => ({
    ...s,
    source_title: titleFor(s.source_type, s.source_id),
    target_title: titleFor(s.target_type, s.target_id),
  }));
}

export function acceptSuggestion(id) {
  const s = get('SELECT * FROM link_suggestions WHERE id = ?', id);
  if (!s) return null;
  const link = createLink({
    sourceType: s.source_type, sourceId: s.source_id, targetType: s.target_type, targetId: s.target_id,
    relationshipType: s.relationship_type, confidence: s.confidence, createdBy: 'user',
  });
  run("UPDATE link_suggestions SET status = 'accepted' WHERE id = ?", id);
  return link;
}

export function rejectSuggestion(id) {
  run("UPDATE link_suggestions SET status = 'rejected' WHERE id = ?", id);
}

export function recentLinks({ limit = 8 } = {}) {
  return all('SELECT * FROM entity_links ORDER BY created_at DESC LIMIT ?', limit).map((l) => ({
    ...l,
    source_title: titleFor(l.source_type, l.source_id),
    target_title: titleFor(l.target_type, l.target_id),
  }));
}
