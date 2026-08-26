import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { uid, nowIso, parseJson } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';

const r = Router();

/* ---------------- Courses ---------------- */

r.get('/courses', (_req, res) => {
  res.json(
    all(
      `SELECT c.*,
        (SELECT COUNT(*) FROM course_topics t WHERE t.course_id = c.id) AS topics_count,
        (SELECT COUNT(*) FROM course_topics t WHERE t.course_id = c.id AND t.done = 1) AS topics_done,
        (SELECT COUNT(*) FROM tasks tk WHERE tk.course_id = c.id AND tk.status NOT IN ('done','cancelled')) AS open_tasks,
        (SELECT COUNT(*) FROM exams e WHERE e.course_id = c.id AND e.exam_date >= date('now')) AS upcoming_exams
       FROM courses c ORDER BY c.created_at DESC`,
    ),
  );
});

r.post('/courses', (req, res) => {
  const b = req.body || {};
  const id = uid('course-');
  run(
    'INSERT INTO courses(id, name, code, credit_hours, instructor, semester, target_grade, notes, color) VALUES (?,?,?,?,?,?,?,?,?)',
    id,
    b.name || 'مادة',
    b.code || null,
    b.credit_hours ?? 3,
    b.instructor || null,
    b.semester || null,
    b.target_grade || null,
    b.notes || '',
    b.color || null,
  );
  emitDomainEvent(EVENT_TYPES.COURSE_CREATED, { entityType: 'course', entityId: id, title: b.name || 'مادة' });
  res.status(201).json(get('SELECT * FROM courses WHERE id = ?', id));
});

r.put('/courses/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE courses SET name=?, code=?, credit_hours=?, instructor=?, semester=?, target_grade=?, notes=?, color=? WHERE id=?',
    b.name,
    b.code || null,
    b.credit_hours ?? 3,
    b.instructor || null,
    b.semester || null,
    b.target_grade || null,
    b.notes || '',
    b.color || null,
    req.params.id,
  );
  res.json(get('SELECT * FROM courses WHERE id = ?', req.params.id));
});

r.delete('/courses/:id', (req, res) => {
  run('DELETE FROM courses WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

r.get('/courses/:id', (req, res) => {
  const course = get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.status(404).json({ error: 'not found' });
  res.json({
    ...course,
    topics: all('SELECT * FROM course_topics WHERE course_id = ? ORDER BY created_at', req.params.id),
    exams: all('SELECT * FROM exams WHERE course_id = ? ORDER BY exam_date', req.params.id),
    tasks: all(
      'SELECT id, title, status, priority, due_date, energy FROM tasks WHERE course_id = ? ORDER BY created_at DESC',
      req.params.id,
    ),
  });
});

r.post('/courses/:id/topics', (req, res) => {
  const b = req.body || {};
  const id = uid('topic-');
  run('INSERT INTO course_topics(id, course_id, title, notes, done) VALUES (?,?,?,?,?)', id, req.params.id, b.title || 'موضوع', b.notes || '', b.done ? 1 : 0);
  res.status(201).json(get('SELECT * FROM course_topics WHERE id = ?', id));
});
r.patch('/topics/:id', (req, res) => {
  const b = req.body || {};
  run('UPDATE course_topics SET title=?, notes=?, done=? WHERE id=?', b.title, b.notes || '', b.done ? 1 : 0, req.params.id);
  res.json(get('SELECT * FROM course_topics WHERE id = ?', req.params.id));
});
r.delete('/topics/:id', (req, res) => {
  run('DELETE FROM course_topics WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Exams ---------------- */

r.get('/exams', (_req, res) => {
  res.json(
    all(
      `SELECT e.*, c.name AS course_name, c.color FROM exams e
       JOIN courses c ON c.id = e.course_id ORDER BY e.exam_date`,
    ),
  );
});
r.post('/exams', (req, res) => {
  const b = req.body || {};
  const id = uid('exam-');
  run(
    'INSERT INTO exams(id, course_id, title, exam_type, exam_date, weight, grade, notes) VALUES (?,?,?,?,?,?,?,?)',
    id,
    b.course_id,
    b.title || 'امتحان',
    b.exam_type || 'OTHER',
    b.exam_date || null,
    b.weight ?? null,
    b.grade ?? null,
    b.notes || '',
  );
  emitDomainEvent(EVENT_TYPES.EXAM_CREATED, { entityType: 'exam', entityId: id, title: b.title || 'امتحان' });
  res.status(201).json(get('SELECT * FROM exams WHERE id = ?', id));
});
r.put('/exams/:id', (req, res) => {
  const b = req.body || {};
  const existing = get('SELECT * FROM exams WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  run(
    'UPDATE exams SET title=?, exam_type=?, exam_date=?, weight=?, grade=?, notes=? WHERE id=?',
    b.title,
    b.exam_type || 'OTHER',
    b.exam_date || null,
    b.weight ?? null,
    b.grade ?? null,
    b.notes || '',
    req.params.id,
  );
  if (b.grade != null) {
    const course = existing.course_id ? get('SELECT name FROM courses WHERE id = ?', existing.course_id) : null;
    emitDomainEvent(EVENT_TYPES.EXAM_GRADE_RECORDED, { entityType: 'exam', entityId: existing.id, title: b.title || existing.title, courseName: course?.name, grade: b.grade });
  }
  res.json(get('SELECT * FROM exams WHERE id = ?', req.params.id));
});
r.delete('/exams/:id', (req, res) => {
  run('DELETE FROM exams WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Work ---------------- */

r.get('/work/shifts', (req, res) => {
  const { start, end } = req.query;
  const where = [];
  const params = [];
  if (start) {
    where.push('shift_start >= ?');
    params.push(start);
  }
  if (end) {
    where.push('shift_start <= ?');
    params.push(end);
  }
  res.json(all(`SELECT * FROM work_shifts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY shift_start`, ...params));
});
r.post('/work/shifts', (req, res) => {
  const b = req.body || {};
  const id = uid('shift-');
  run('INSERT INTO work_shifts(id, shift_start, shift_end, role, notes) VALUES (?,?,?,?,?)', id, b.shift_start || nowIso(), b.shift_end || null, b.role || null, b.notes || '');
  res.status(201).json(get('SELECT * FROM work_shifts WHERE id = ?', id));
});
r.delete('/work/shifts/:id', (req, res) => {
  run('DELETE FROM work_shifts WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

r.get('/work/notes', (req, res) => {
  const { q } = req.query;
  const rows = q
    ? all('SELECT * FROM work_notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC', `%${q}%`, `%${q}%`)
    : all('SELECT * FROM work_notes ORDER BY updated_at DESC');
  res.json(rows.map((row) => ({ ...row, tags: parseJson(row.tags, []) })));
});
r.post('/work/notes', (req, res) => {
  const b = req.body || {};
  const id = uid('wn-');
  run('INSERT INTO work_notes(id, title, content, tags, created_at, updated_at) VALUES (?,?,?,?,?,?)', id, b.title || 'ملاحظة عمل', b.content || '', JSON.stringify(b.tags || []), nowIso(), nowIso());
  emitDomainEvent(EVENT_TYPES.WORK_NOTE_CREATED, { entityType: 'work_note', entityId: id, title: b.title || 'ملاحظة عمل' });
  res.status(201).json(get('SELECT * FROM work_notes WHERE id = ?', id));
});
r.put('/work/notes/:id', (req, res) => {
  const b = req.body || {};
  run('UPDATE work_notes SET title=?, content=?, tags=?, updated_at=? WHERE id=?', b.title, b.content || '', JSON.stringify(b.tags || []), nowIso(), req.params.id);
  res.json(get('SELECT * FROM work_notes WHERE id = ?', req.params.id));
});
r.delete('/work/notes/:id', (req, res) => {
  run('DELETE FROM work_notes WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

export default r;
