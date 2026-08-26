import { Router } from 'express';
import { all, get, run, transaction } from '../db/index.js';
import { uid, nowIso, parseJson, dateKey } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';

const r = Router();

function rowTask(row) {
  if (!row) return null;
  return { ...row, tags: parseJson(row.tags, []), dependencies: parseJson(row.dependencies, []), completed: row.status === 'done' };
}
function rowProject(row) {
  return row ? { ...row } : null;
}
function rowJournal(row) {
  return row ? { ...row, tags: parseJson(row.tags, []), ai_access: !!row.ai_access } : null;
}

/* ---------------- Tasks ---------------- */

r.get('/tasks', (req, res) => {
  const { status, project, course, q, energy, priority } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (project) {
    where.push('project_id = ?');
    params.push(project);
  }
  if (course) {
    where.push('course_id = ?');
    params.push(course);
  }
  if (energy) {
    where.push('energy = ?');
    params.push(energy);
  }
  if (priority) {
    where.push('priority = ?');
    params.push(priority);
  }
  if (q) {
    where.push('(title LIKE ? OR description LIKE ? OR notes LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = all(
    `SELECT t.*, p.name AS project_name, c.name AS course_name
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
                  LEFT JOIN courses c ON c.id = t.course_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at DESC`,
    ...params,
  );
  res.json(rows.map(rowTask));
});

r.post('/tasks', (req, res) => {
  const b = req.body || {};
  const id = uid('task-');
  const now = nowIso();
  run(
    `INSERT INTO tasks(id, title, description, priority, energy, est_minutes, due_date, project_id, course_id, tags, status, recurring_rule, dependencies, notes, created_at, updated_at, completed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    b.title || 'مهمة',
    b.description || '',
    b.priority || 'medium',
    b.energy || 'medium',
    b.est_minutes ?? null,
    b.due_date || null,
    b.project_id || null,
    b.course_id || null,
    JSON.stringify(b.tags || []),
    b.status || 'inbox',
    b.recurring_rule || null,
    JSON.stringify(b.dependencies || []),
    b.notes || '',
    now,
    now,
    b.status === 'done' ? now : null,
  );
  emitDomainEvent(EVENT_TYPES.TASK_CREATED, { entityType: 'task', entityId: id, title: b.title || 'مهمة' });
  res.status(201).json(rowTask(get('SELECT * FROM tasks WHERE id = ?', id)));
});

r.get('/tasks/:id', (req, res) => {
  const row = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(rowTask(row));
});

r.put('/tasks/:id', (req, res) => {
  const existing = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const next = { ...existing, ...b };
  run(
    `UPDATE tasks SET title=?, description=?, priority=?, energy=?, est_minutes=?, due_date=?, project_id=?, course_id=?, tags=?, status=?, recurring_rule=?, dependencies=?, notes=?, updated_at=?, completed_at=? WHERE id=?`,
    next.title,
    next.description ?? '',
    next.priority || 'medium',
    next.energy || 'medium',
    next.est_minutes ?? null,
    next.due_date || null,
    next.project_id || null,
    next.course_id || null,
    JSON.stringify(next.tags || []),
    next.status || 'inbox',
    next.recurring_rule || null,
    JSON.stringify(next.dependencies || []),
    next.notes ?? '',
    nowIso(),
    next.status === 'done' ? nowIso() : null,
    req.params.id,
  );
  res.json(rowTask(get('SELECT * FROM tasks WHERE id = ?', req.params.id)));
});

r.post('/tasks/:id/complete', (req, res) => {
  const row = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const done = row.status === 'done' ? false : true;
  run(
    'UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    done ? 'done' : 'inbox',
    done ? nowIso() : null,
    nowIso(),
    req.params.id,
  );
  if (done) {
    emitDomainEvent(EVENT_TYPES.TASK_COMPLETED, { entityType: 'task', entityId: row.id, title: row.title, summary: 'أنجز مهمة: ' + row.title });
  }
  res.json(rowTask(get('SELECT * FROM tasks WHERE id = ?', req.params.id)));
});

r.delete('/tasks/:id', (req, res) => {
  run('DELETE FROM tasks WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Projects ---------------- */

r.get('/projects', (_req, res) => {
  res.json(
    all(
      `SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','cancelled')) AS open_tasks
       FROM projects p ORDER BY p.created_at DESC`,
    ),
  );
});
r.post('/projects', (req, res) => {
  const b = req.body || {};
  const id = uid('prj-');
  run('INSERT INTO projects(id, name, goal_id, workspace, notes) VALUES (?,?,?,?,?)', id, b.name || 'مشروع', b.goal_id || null, b.workspace || null, b.notes || '');
  res.status(201).json(get('SELECT * FROM projects WHERE id = ?', id));
});
r.put('/projects/:id', (req, res) => {
  const b = req.body || {};
  run('UPDATE projects SET name=?, goal_id=?, workspace=?, notes=? WHERE id=?', b.name, b.goal_id || null, b.workspace || null, b.notes || '', req.params.id);
  res.json(get('SELECT * FROM projects WHERE id = ?', req.params.id));
});
r.delete('/projects/:id', (req, res) => {
  run('DELETE FROM projects WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Goals ---------------- */

r.get('/goals', (_req, res) => {
  const goals = all(
    `SELECT g.*,
       (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.done = 1) AS milestones_done,
       (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id) AS milestones_total,
       (SELECT COUNT(*) FROM projects p WHERE p.goal_id = g.id) AS projects
     FROM goals g ORDER BY g.created_at DESC`,
  ).map((g) => ({
    ...g,
    progress: Number(g.progress),
    milestones: all('SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY due_date, created_at', g.id).map((m) => ({ ...m, done: !!m.done })),
  }));
  res.json(goals);
});
r.post('/goals', (req, res) => {
  const b = req.body || {};
  const id = uid('goal-');
  run(
    'INSERT INTO goals(id, title, life_area, target_date, status, progress, notes) VALUES (?,?,?,?,?,?,?)',
    id,
    b.title || 'هدف',
    b.life_area || null,
    b.target_date || null,
    b.status || 'active',
    b.progress ?? 0,
    b.notes || '',
  );
  emitDomainEvent(EVENT_TYPES.GOAL_PROGRESS_CHANGED, { entityType: 'goal', entityId: id, title: b.title || 'هدف' });
  res.status(201).json(get('SELECT * FROM goals WHERE id = ?', id));
});
r.put('/goals/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE goals SET title=?, life_area=?, target_date=?, status=?, progress=?, notes=?, updated_at=? WHERE id=?',
    b.title,
    b.life_area || null,
    b.target_date || null,
    b.status || 'active',
    b.progress ?? 0,
    b.notes || '',
    nowIso(),
    req.params.id,
  );
  res.json(get('SELECT * FROM goals WHERE id = ?', req.params.id));
});
r.delete('/goals/:id', (req, res) => {
  run('DELETE FROM goals WHERE id = ?', req.params.id);
  res.json({ ok: true });
});
r.post('/goals/:id/milestones', (req, res) => {
  const b = req.body || {};
  const id = uid('ms-');
  run('INSERT INTO goal_milestones(id, goal_id, title, done, due_date) VALUES (?,?,?,?,?)', id, req.params.id, b.title || 'مرحلة', b.done ? 1 : 0, b.due_date || null);
  res.status(201).json(get('SELECT * FROM goal_milestones WHERE id = ?', id));
});
r.patch('/milestones/:id', (req, res) => {
  const b = req.body || {};
  const existing = get('SELECT * FROM goal_milestones WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  run('UPDATE goal_milestones SET title=?, done=?, due_date=? WHERE id=?', b.title, b.done ? 1 : 0, b.due_date || null, req.params.id);
  if (b.done) {
    const goal = existing.goal_id ? get('SELECT title FROM goals WHERE id = ?', existing.goal_id) : null;
    emitDomainEvent(EVENT_TYPES.MILESTONE_COMPLETED, { entityType: 'milestone', entityId: existing.id, title: existing.title, goalTitle: goal?.title });
  }
  res.json(get('SELECT * FROM goal_milestones WHERE id = ?', req.params.id));
});
r.delete('/milestones/:id', (req, res) => {
  run('DELETE FROM goal_milestones WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Journal ---------------- */

r.get('/journal', (req, res) => {
  const { q, date } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR content LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (date) {
    where.push('entry_date = ?');
    params.push(date);
  }
  const rows = all(
    `SELECT * FROM journal_entries ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY entry_date DESC, created_at DESC`,
    ...params,
  );
  res.json(rows.map(rowJournal));
});
r.post('/journal', (req, res) => {
  const b = req.body || {};
  const id = uid('journal-');
  run(
    'INSERT INTO journal_entries(id, title, content, entry_date, tags, mood, ai_access, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id,
    b.title || '',
    b.content || '',
    b.entry_date || dateKey(),
    JSON.stringify(b.tags || []),
    b.mood || null,
    b.ai_access === false ? 0 : 1,
    nowIso(),
    nowIso(),
  );
  emitDomainEvent(EVENT_TYPES.JOURNAL_CREATED, { entityType: 'journal', entityId: id, title: b.title || '' });
  res.status(201).json(rowJournal(get('SELECT * FROM journal_entries WHERE id = ?', id)));
});
r.put('/journal/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE journal_entries SET title=?, content=?, entry_date=?, tags=?, mood=?, ai_access=?, updated_at=? WHERE id=?',
    b.title ?? '',
    b.content ?? '',
    b.entry_date ?? dateKey(),
    JSON.stringify(b.tags || []),
    b.mood ?? null,
    b.ai_access === false ? 0 : 1,
    nowIso(),
    req.params.id,
  );
  res.json(rowJournal(get('SELECT * FROM journal_entries WHERE id = ?', req.params.id)));
});
r.delete('/journal/:id', (req, res) => {
  run('DELETE FROM journal_entries WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Gratitude ---------------- */

r.get('/gratitude', (req, res) => {
  res.json(
    all(
      'SELECT * FROM gratitude_entries ORDER BY entry_date DESC, created_at DESC',
    ).map((row) => ({ ...row, items: parseJson(row.items, []) })),
  );
});
r.post('/gratitude', (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : String(b.items || '').split('\n').filter((x) => x.trim());
  const id = uid('grat-');
  run('INSERT INTO gratitude_entries(id, items, entry_date) VALUES (?,?,?)', id, JSON.stringify(items), b.entry_date || dateKey());
  res.status(201).json({ ...get('SELECT * FROM gratitude_entries WHERE id = ?', id), items });
});
r.delete('/gratitude/:id', (req, res) => {
  run('DELETE FROM gratitude_entries WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Calendar ---------------- */

r.get('/calendar', (req, res) => {
  const { start, end } = req.query;
  const where = [];
  const params = [];
  if (start) {
    where.push('start >= ?');
    params.push(start);
  }
  if (end) {
    where.push('start <= ?');
    params.push(end);
  }
  res.json(
    all(`SELECT * FROM calendar_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY start`,
      ...params,
    ).map((row) => ({ ...row, reminders: parseJson(row.reminders, []) })),
  );
});
r.post('/calendar', (req, res) => {
  const b = req.body || {};
  const id = uid('evt-');
  run(
    'INSERT INTO calendar_events(id, title, start, end, category, location, notes, reminders) VALUES (?,?,?,?,?,?,?,?)',
    id,
    b.title || 'حدث',
    b.start || nowIso(),
    b.end || null,
    b.category || 'general',
    b.location || null,
    b.notes || '',
    JSON.stringify(b.reminders || []),
  );
  res.status(201).json(get('SELECT * FROM calendar_events WHERE id = ?', id));
});
r.put('/calendar/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE calendar_events SET title=?, start=?, end=?, category=?, location=?, notes=?, reminders=? WHERE id=?',
    b.title,
    b.start || nowIso(),
    b.end || null,
    b.category || 'general',
    b.location || null,
    b.notes || '',
    JSON.stringify(b.reminders || []),
    req.params.id,
  );
  res.json(get('SELECT * FROM calendar_events WHERE id = ?', req.params.id));
});
r.delete('/calendar/:id', (req, res) => {
  run('DELETE FROM calendar_events WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Check-ins ---------------- */

r.get('/checkins', (req, res) => {
  const { date, limit = 30 } = req.query;
  if (date) {
    const row = get('SELECT * FROM checkins WHERE entry_date = ?', date);
    return res.json(row ? [row] : []);
  }
  res.json(all('SELECT * FROM checkins ORDER BY entry_date DESC LIMIT ?', Number(limit) || 30));
});
r.put('/checkins/:date', (req, res) => {
  const b = req.body || {};
  run(
    `INSERT INTO checkins(id, entry_date, energy, stress, sleep_hours, concern, success) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(entry_date) DO UPDATE SET energy=excluded.energy, stress=excluded.stress, sleep_hours=excluded.sleep_hours, concern=excluded.concern, success=excluded.success
     `,
    uid('ck-'),
    req.params.date,
    b.energy ?? null,
    b.stress ?? null,
    b.sleep_hours ?? null,
    b.concern || '',
    b.success || '',
  );
  const parts = [];
  if (b.energy != null) parts.push(`طاقة ${b.energy}/5`);
  if (b.stress != null) parts.push(`ضغط ${b.stress}/5`);
  if (b.sleep_hours != null) parts.push(`نوم ${b.sleep_hours} ساعات`);
  if (parts.length) {
    emitDomainEvent(EVENT_TYPES.CHECKIN_CREATED, { entityType: 'checkin', entityId: req.params.date, summary: 'تسجيل يوم ' + req.params.date + ': ' + parts.join('، ') });
  }
  res.json(get('SELECT * FROM checkins WHERE entry_date = ?', req.params.date));
});

export default r;
