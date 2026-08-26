import { all, get } from '../db/index.js';
import { getRecentActivity } from './activity.js';
import { listLinkSuggestions } from './links.js';
import { searchMemories } from './memory.js';
import { getEntityLinks, relatedEntities } from './links.js';

/**
 * Page-adaptive contextual intelligence ("السياق الذكي").
 * Given the current page (and optionally a focused entity), returns the
 * most useful cross-domain context: related entities, memories, tasks,
 * deadlines, conversations, activity and pending link suggestions.
 */
export function smartContext({ page = 'today', focusType = null, focusId = null, limit = 6 } = {}) {
  const out = {
    page,
    focus: null,
    related: [],
    memories: [],
    tasks: [],
    goals: [],
    deadlines: [],
    conversations: [],
    activity: [],
    linkSuggestions: [],
  };

  const now = Date.now();
  const DAY = 86400000;

  // Focused entity → its links and linked memories take priority.
  if (focusType && focusId) {
    const entityRow = entityRowFor(focusType, focusId);
    if (entityRow) out.focus = { type: focusType, id: String(focusId), title: entityRow.title };
    out.related = relatedEntities(focusType, focusId, { limit });
    // Memories linked directly to the entity
    const links = getEntityLinks(focusType, focusId);
    for (const l of links.slice(0, 10)) {
      const isSource = l.source_type === focusType && l.source_id === String(focusId);
      const tType = isSource ? l.target_type : l.source_type;
      const tId = isSource ? l.target_id : l.source_id;
      if (tType === 'memory') {
        const m = get('SELECT content FROM memories WHERE id = ?', tId);
        if (m) out.memories.push({ id: tId, title: m.content.slice(0, 80), sub: 'ذاكرة مرتبطة' });
      }
    }
  }

  // Page relevance keywords for retrieval.
  const pageKeywords = { study: 'دراسة مادة امتحان محاضرة', work: 'عمل مناوبة', safe: 'قلق إرهاق هدوء', journal: 'يوميات مشاعر', goals: 'هدف' };
  const query = pageKeywords[page] || '';

  // Memories (page-weighted)
  if (out.memories.length < 3) {
    const mems = searchMemories(query, { limit: 3, aiAccess: true });
    for (const m of mems) out.memories.push({ id: m.id, title: m.content.slice(0, 80), sub: 'ذاكرة' });
    out.memories = out.memories.slice(0, 4);
  }

  // Open high-priority tasks
  out.tasks = all(
    `SELECT id, title, priority, due_date FROM tasks
     WHERE status NOT IN ('done','cancelled')
     ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC LIMIT ?`,
    limit,
  ).map((t) => ({ id: t.id, title: t.title, sub: `${t.priority}${t.due_date ? ` — ${t.due_date}` : ''}` }));

  // Active goals with progress
  out.goals = all("SELECT id, title, progress FROM goals WHERE status = 'active' ORDER BY created_at DESC LIMIT 4").map((g) => ({
    id: g.id,
    title: g.title,
    sub: `تقدم ${Math.round(g.progress * 100)}%`,
  }));

  // Deadlines: exams + due tasks in the next 14 days
  const soon = new Date(now + 14 * DAY).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const exams = all(
    `SELECT e.id, e.title, e.exam_date, c.name AS course FROM exams e
     JOIN courses c ON c.id = e.course_id
     WHERE e.exam_date BETWEEN ? AND ? ORDER BY e.exam_date LIMIT 4`,
    today, soon,
  ).map((e) => ({ type: 'exam', id: e.id, title: e.title, sub: `${e.course} — ${e.exam_date}` }));
  const dueTasks = all(
    `SELECT id, title, due_date FROM tasks WHERE status NOT IN ('done','cancelled') AND due_date BETWEEN ? AND ? ORDER BY due_date LIMIT 4`,
    today, soon,
  ).map((t) => ({ type: 'task', id: t.id, title: t.title, sub: t.due_date }));
  out.deadlines = [...exams, ...dueTasks].slice(0, 6);

  // Recent conversations (page-relevant first by folder name overlap)
  out.conversations = all(
    'SELECT id, title, folder, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 6',
  ).map((c) => ({ id: c.id, title: c.title, sub: c.folder || 'محادثة' }));

  // Recent activity
  out.activity = getRecentActivity({ limit: 6 }).map((a) => ({ id: a.id, title: a.summary, sub: a.ts?.slice(0, 16).replace('T', ' ') }));

  // Pending link suggestions
  out.linkSuggestions = listLinkSuggestions({ status: 'pending', limit: 4 }).map((s) => ({
    id: s.id,
    title: `${s.source_title || s.source_type} ↔ ${s.target_title || s.target_type}`,
    sub: s.reason || 'اقتراح ربط',
  }));

  return out;
}

function entityRowFor(type, id) {
  if (!id) return null;
  switch (type) {
    case 'task': { const r = get('SELECT title FROM tasks WHERE id = ?', String(id)); return r ? { title: r.title } : null; }
    case 'journal': { const r = get('SELECT title FROM journal_entries WHERE id = ?', String(id)); return r ? { title: r.title || 'يوميات' } : null; }
    case 'goal': { const r = get('SELECT title FROM goals WHERE id = ?', String(id)); return r ? { title: r.title } : null; }
    case 'course': { const r = get('SELECT name FROM courses WHERE id = ?', String(id)); return r ? { title: r.name } : null; }
    case 'exam': { const r = get('SELECT title FROM exams WHERE id = ?', String(id)); return r ? { title: r.title } : null; }
    case 'conversation': { const r = get('SELECT title FROM conversations WHERE id = ?', String(id)); return r ? { title: r.title } : null; }
    case 'memory': { const r = get('SELECT content FROM memories WHERE id = ?', String(id)); return r ? { title: r.content.slice(0, 60) } : null; }
    case 'work_note': { const r = get('SELECT title FROM work_notes WHERE id = ?', String(id)); return r ? { title: r.title } : null; }
    case 'safe_living_plan': { const r = get('SELECT name FROM safe_living_plans WHERE id = ?', String(id)); return r ? { title: r.name } : null; }
    default: return null;
  }
}
