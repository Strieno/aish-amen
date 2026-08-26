import { all } from '../db/index.js';

/**
 * Universal keyword search across all modules. Grouped results with compact
 * summaries — no external service required.
 */
export function universalSearch(query, { perGroup = 5 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { groups: [], total: 0 };
  const like = `%${q}%`;
  const groups = [];
  let total = 0;

  const add = (type, label, rows, pick) => {
    const items = rows.map(pick).filter((it) => it && it.title);
    if (!items.length) return;
    groups.push({ type, label, items: items.slice(0, perGroup) });
    total += items.length;
  };

  add('task', 'مهام', all('SELECT id, title, status FROM tasks WHERE title LIKE ? OR notes LIKE ? LIMIT ?', like, like, perGroup + 2), (r) => ({ id: r.id, title: r.title, sub: r.status }));
  add('journal', 'يوميات', all('SELECT id, title, entry_date FROM journal_entries WHERE title LIKE ? OR content LIKE ? LIMIT ?', like, like, perGroup + 2), (r) => ({ id: r.id, title: r.title || 'بدون عنوان', sub: r.entry_date }));
  add('memory', 'ذكريات', all('SELECT id, content, type FROM memories WHERE archived = 0 AND content LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.content.slice(0, 70), sub: r.type }));
  add('goal', 'أهداف', all('SELECT id, title, life_area FROM goals WHERE title LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.title, sub: r.life_area || 'هدف' }));
  add('milestone', 'مراحل', all('SELECT id, title FROM goal_milestones WHERE title LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.title, sub: 'مرحلة' }));
  add('course', 'مواد', all('SELECT id, name, code FROM courses WHERE name LIKE ? OR code LIKE ? LIMIT ?', like, like, perGroup + 2), (r) => ({ id: r.id, title: `${r.name}${r.code ? ` (${r.code})` : ''}`, sub: 'مادة' }));
  add('exam', 'امتحانات', all('SELECT id, title, exam_date FROM exams WHERE title LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.title, sub: r.exam_date || 'امتحان' }));
  add('work_note', 'ملاحظات عمل', all('SELECT id, title FROM work_notes WHERE title LIKE ? OR content LIKE ? LIMIT ?', like, like, perGroup + 2), (r) => ({ id: r.id, title: r.title, sub: 'عمل' }));
  add('checkin', 'تسجيلات', all('SELECT id, entry_date FROM checkins WHERE concern LIKE ? OR success LIKE ? OR entry_date LIKE ? LIMIT ?', like, like, like, perGroup + 2), (r) => ({ id: r.id, title: `تسجيل ${r.entry_date}`, sub: 'حالة يومية' }));
  add('conversation', 'محادثات', all('SELECT id, title FROM conversations WHERE title LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.title, sub: 'محادثة' }));
  add('safe_living_plan', 'خطط العيش الآمن', all('SELECT id, name FROM safe_living_plans WHERE name LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.name, sub: 'خطة' }));
  add('document', 'مستندات', all('SELECT id, filename, status FROM documents WHERE filename LIKE ? LIMIT ?', like, perGroup + 2), (r) => ({ id: r.id, title: r.filename, sub: r.status }));

  return { groups, total };
}
