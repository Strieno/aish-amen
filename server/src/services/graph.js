import { all, get } from '../db/index.js';
import { getEntityLinks } from './links.js';
import { entityLabel } from './links.js';

const TYPE_COLORS = {
  goal: 'brand',
  task: 'warn',
  course: 'study',
  exam: 'danger',
  conversation: 'chat',
  memory: 'memory',
  journal: 'journal',
  milestone: 'brand',
  focus_session: 'focus',
  work_note: 'work',
  safe_living_plan: 'safe',
  checkin: 'checkin',
};

export function nodeColor(type) {
  return TYPE_COLORS[type] || 'neutral';
}

function nodeFor(type, id) {
  const title = titleFor(type, id);
  if (!title) return null;
  return {
    id: `${type}:${id}`,
    type,
    entityId: String(id),
    title,
    sub: subFor(type, id) || entityLabel(type),
  };
}

function titleFor(type, id) {
  if (!id) return null;
  switch (type) {
    case 'task': return get('SELECT title FROM tasks WHERE id = ?', String(id))?.title || null;
    case 'journal': { const r = get('SELECT title, entry_date FROM journal_entries WHERE id = ?', String(id)); return r ? r.title || `يوميات ${r.entry_date}` : null; }
    case 'goal': return get('SELECT title FROM goals WHERE id = ?', String(id))?.title || null;
    case 'milestone': return get('SELECT title FROM goal_milestones WHERE id = ?', String(id))?.title || null;
    case 'course': return get('SELECT name FROM courses WHERE id = ?', String(id))?.name || null;
    case 'exam': return get('SELECT title FROM exams WHERE id = ?', String(id))?.title || null;
    case 'checkin': { const r = get('SELECT entry_date FROM checkins WHERE id = ?', String(id)); return r ? `تسجيل ${r.entry_date}` : null; }
    case 'focus_session': { const r = get('SELECT minutes FROM focus_sessions WHERE id = ?', String(id)); return r ? `تركيز ${r.minutes}د` : null; }
    case 'work_note': return get('SELECT title FROM work_notes WHERE id = ?', String(id))?.title || null;
    case 'safe_living_plan': return get('SELECT name FROM safe_living_plans WHERE id = ?', String(id))?.name || null;
    case 'conversation': return get('SELECT title FROM conversations WHERE id = ?', String(id))?.title || null;
    case 'memory': return get('SELECT content FROM memories WHERE id = ?', String(id))?.content?.slice(0, 60) || null;
    default: return null;
  }
}

function subFor(type, id) {
  if (!id) return null;
  switch (type) {
    case 'task': return get('SELECT priority FROM tasks WHERE id = ?', String(id))?.priority || null;
    case 'goal': return get('SELECT life_area FROM goals WHERE id = ?', String(id))?.life_area || null;
    case 'course': return get('SELECT code FROM courses WHERE id = ?', String(id))?.code || null;
    case 'exam': return get('SELECT exam_date FROM exams WHERE id = ?', String(id))?.exam_date || null;
    default: return null;
  }
}

function seedNodes() {
  const nodes = [];
  const push = (type, rows, idField, titleField) => {
    for (const r of rows) {
      const n = nodeFor(type, r[idField]);
      if (n) {
        n.title = r[titleField] !== undefined ? r[titleField] : n.title;
        nodes.push(n);
      }
    }
  };
  push('goal', all("SELECT id, title FROM goals WHERE status = 'active' LIMIT 4"), 'id', 'title');
  push('exam', all('SELECT id, title FROM exams ORDER BY CASE WHEN exam_date IS NULL THEN 1 ELSE 0 END, exam_date LIMIT 3'), 'id', 'title');
  push('course', all('SELECT id, name FROM courses LIMIT 3'), 'id', 'name');
  push('conversation', all('SELECT id, title FROM conversations ORDER BY updated_at DESC LIMIT 3'), 'id', 'title');
  push('memory', all('SELECT id, content FROM memories WHERE archived = 0 AND pinned = 1 LIMIT 3'), 'id', 'content');
  push('task', all("SELECT id, title FROM tasks WHERE status NOT IN ('done','cancelled') ORDER BY CASE priority WHEN 'high' THEN 0 ELSE 1 END LIMIT 3"), 'id', 'title');
  return nodes;
}

/**
 * Graph view: a focused ego-network around one entity, or a curated seed
 * set of high-value entities with the links that connect them.
 */
export function graphQuery({ entityType, entityId, typeFilter = [], includeEdges = true } = {}) {
  const nodesMap = new Map();
  const edges = [];
  const edgeSeen = new Set();

  const addNode = (n) => {
    if (!n) return null;
    nodesMap.set(n.id, n);
    return n;
  };
  const addEdge = (l) => {
    const a = nodesMap.get(`${l.source_type}:${l.source_id}`);
    const b = nodesMap.get(`${l.target_type}:${l.target_id}`);
    if (!a || !b) return;
    const key = [a.id, b.id].sort().join('|') + '|' + l.relationship_type;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ id: l.id, source: a.id, target: b.id, relationship: l.relationship_type, confidence: l.confidence, created_by: l.created_by });
  };

  if (entityType && entityId) {
    const center = addNode(nodeFor(entityType, entityId));
    if (!center) return { nodes: [], edges: [] };
    const links = getEntityLinks(entityType, entityId);
    for (const l of links.slice(0, 40)) {
      const isSource = l.source_type === entityType && l.source_id === String(entityId);
      const tType = isSource ? l.target_type : l.source_type;
      const tId = isSource ? l.target_id : l.source_id;
      if (typeFilter.length && !typeFilter.includes(tType)) continue;
      addNode(nodeFor(tType, tId));
    }
    if (includeEdges) {
      for (const l of getEntityLinks(entityType, entityId)) addEdge(l);
    }
  } else {
    for (const n of seedNodes()) {
      if (typeFilter.length && !typeFilter.includes(n.type)) continue;
      addNode(n);
    }
    if (includeEdges) {
      const rows = all('SELECT * FROM entity_links ORDER BY created_at DESC LIMIT 2000');
      for (const l of rows) {
        if (nodesMap.has(`${l.source_type}:${l.source_id}`) && nodesMap.has(`${l.target_type}:${l.target_id}`)) {
          addEdge(l);
        }
      }
    }
  }

  // Filter out nodes with no edges when we have a center (keep the center).
  let nodes = [...nodesMap.values()];
  if (entityType && entityId && includeEdges) {
    const connected = new Set([`${entityType}:${entityId}`]);
    for (const e of edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    nodes = nodes.filter((n) => connected.has(n.id));
  }

  return { nodes, edges, center: entityType && entityId ? `${entityType}:${entityId}` : null };
}
