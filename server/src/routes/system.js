import { Router } from 'express';
import { all, get, run, logEvent, rebuildFts } from '../db/index.js';
import { getSetting, setSetting, patchSetting } from '../services/settings.js';
import * as backupService from '../services/backup.js';
import { getInsights } from '../services/insights.js';
import { dateKey, uid, nowIso } from '../lib/util.js';
import { onAnyDomainEvent } from '../services/events.js';
import { listLinkSuggestions } from '../services/links.js';

const r = Router();

r.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'Aish Aman OS', version: '0.1.0', time: new Date().toISOString() });
});

/* ---------------- Live event stream (SSE) ----------------
 * The frontend keeps one connection open; every domain event
 * (TaskCompleted, JournalEntryCreated, LinkCreated, ...) is pushed so
 * pages update themselves without manual refresh. */

r.get('/events/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write(`event: connected\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);

  const unsubscribe = onAnyDomainEvent((payload, eventType) => {
    if (res.writableEnded) return;
    const event = {
      event_type: eventType,
      entity_type: payload?.entityType || null,
      entity_id: payload?.entityId || null,
      summary: payload?.summary || '',
      ts: new Date().toISOString(),
    };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat keeps proxies/connections alive and detects staleness.
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': ping\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/* ---------------- Settings ---------------- */

r.get('/settings', (_req, res) => {
  const rows = all('SELECT key, value FROM settings');
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  res.json(out);
});

r.put('/settings', (req, res) => {
  const body = req.body || {};
  for (const [k, v] of Object.entries(body)) {
    setSetting(k, v);
  }
  res.json({ ok: true });
});

r.get('/settings/:key', (req, res) => {
  res.json(getSetting(req.params.key));
});

r.put('/settings/:key', (req, res) => {
  const body = req.body || {};
  const current = getSetting(req.params.key);
  if (current && typeof current === 'object' && !Array.isArray(current) && body && typeof body === 'object' && !Array.isArray(body)) {
    setSetting(req.params.key, { ...current, ...body });
  } else {
    setSetting(req.params.key, body);
  }
  res.json(getSetting(req.params.key));
});

/* ---------------- Backups ---------------- */

r.get('/backups', (_req, res) => res.json(backupService.listBackups()));
r.post('/backups', (_req, res) => {
  try {
    const b = backupService.createBackup();
    res.status(201).json(b);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
r.post('/backups/:id/restore', (req, res) => {
  try {
    backupService.restoreBackup(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
r.delete('/backups/:id', (req, res) => {
  try {
    backupService.deleteBackup(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------------- Insights ---------------- */

r.get('/insights', (_req, res) => res.json(getInsights()));

/* ---------------- Events ---------------- */

r.get('/events', (req, res) => {
  res.json(
    all(
      'SELECT id, level, category, message, created_at FROM app_events ORDER BY id DESC LIMIT ?',
      Number(req.query.limit) || 50,
    ),
  );
});

/* ---------------- Dashboard ---------------- */

r.get('/dashboard/today', (req, res) => {
  const today = dateKey();
  const nowTime = new Date().toTimeString().slice(0, 5);

  const tasks = all(
    "SELECT * FROM tasks WHERE status NOT IN ('done','cancelled') AND (due_date IS NULL OR due_date = ?) ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END",
    today,
  ).map((t) => ({ ...t, tags: JSON.parse(t.tags || '[]') }));

  const schedule = all(
    'SELECT * FROM calendar_events WHERE start LIKE ? ORDER BY start LIMIT 12',
    `${today}%`,
  );

  const eventsToday = schedule.length;
  const highPrio = tasks.filter((t) => t.priority === 'high').length;
  const openTotal = all("SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('done','cancelled')")[0].n;
  const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today) || null;

  const doneToday = all('SELECT * FROM tasks WHERE status = ? AND completed_at LIKE ?', 'done', `${today}%`).length;
  const focusToday = all("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed = 1 AND started_at LIKE ?", `${today}%`)[0].m;

  // Load estimate (non-diagnostic).
  let load = 0;
  if (checkin?.stress && checkin.stress >= 4) load += 2;
  if (checkin?.energy && checkin.energy <= 2) load += 2;
  if (highPrio >= 3) load += 2;
  else if (highPrio >= 1) load += 1;
  if (openTotal >= 12) load += 1;
  if (eventsToday >= 6) load += 1;
  const level = load >= 4 ? 'overloaded' : load >= 2 ? 'slightly-overloaded' : 'stable';

  const nextRoutine = schedule.find((e) => e.start >= `${today}T00:00:00`) || null;

  // LifeOS intelligence: study deadlines, goals, connections, resume
  const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const study = {
    exams: all(
      `SELECT e.id, e.title, e.exam_date, c.name AS course FROM exams e
       JOIN courses c ON c.id = e.course_id
       WHERE e.exam_date BETWEEN ? AND ? ORDER BY e.exam_date LIMIT 3`,
      today, soon,
    ),
    courses: all('SELECT c.id, c.name FROM courses c ORDER BY c.created_at DESC LIMIT 3'),
  };
  const goalsSummary = all("SELECT id, title, progress FROM goals WHERE status = 'active' ORDER BY created_at DESC LIMIT 4").map((g) => ({ ...g, progress: Number(g.progress) }));
  const connections = all('SELECT * FROM entity_links ORDER BY created_at DESC LIMIT 5').map((l) => ({
    id: l.id,
    source_type: l.source_type,
    source_id: l.source_id,
    target_type: l.target_type,
    target_id: l.target_id,
    relationship_type: l.relationship_type,
    created_by: l.created_by,
  }));
  const resume = {
    conversation: all('SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 1')[0] || null,
    task: all("SELECT id, title FROM tasks WHERE status NOT IN ('done','cancelled') ORDER BY updated_at DESC LIMIT 1")[0] || null,
    journal: all('SELECT id, title, entry_date FROM journal_entries ORDER BY entry_date DESC LIMIT 1')[0] || null,
  };
  const pendingLinks = listLinkSuggestions({ status: 'pending', limit: 4 });

  res.json({
    today,
    now: nowTime,
    tasks,
    schedule,
    checkin,
    stats: { doneToday, focusMinutesToday: focusToday, openTotal },
    safe: { level, load },
    nextEvent: nextRoutine
      ? { title: nextRoutine.title, start: nextRoutine.start }
      : null,
    intelligence: { study, goals: goalsSummary, connections, resume, pendingLinks },
  });
});

/* ---------------- Weekly dashboard (visual layer) ---------------- */

r.get('/dashboard/week', (_req, res) => {
  const days = [];
  const moodMap = { great: 5, good: 4, neutral: 3, low: 2, bad: 1 };
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', key);
    const tasksDone = all('SELECT COUNT(*) AS n FROM tasks WHERE status = ? AND completed_at LIKE ?', 'done', `${key}%`)[0].n;
    const focusMinutes = all("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed = 1 AND started_at LIKE ?", `${key}%`)[0].m;
    const journalMood = get('SELECT mood FROM journal_entries WHERE entry_date = ? AND mood IS NOT NULL ORDER BY created_at DESC LIMIT 1', key);
    const gratitude = all('SELECT COUNT(*) AS n FROM gratitude_entries WHERE entry_date = ?', key)[0].n;

    let quality = 0;
    if (checkin) quality += checkin.stress && checkin.stress <= 2 ? 2 : 1;
    if (tasksDone > 0) quality += Math.min(2, tasksDone);
    if (focusMinutes >= 25) quality += 2;
    else if (focusMinutes > 0) quality += 1;
    if (gratitude > 0) quality += 1;
    if (journalMood?.mood && moodMap[journalMood.mood] >= 4) quality += 1;

    days.push({
      date: key,
      quality: Math.min(7, quality),
      mood: journalMood?.mood || (checkin ? (checkin.energy >= 4 ? 'good' : checkin.energy <= 2 ? 'low' : 'neutral') : null),
      stress: checkin?.stress ?? null,
      energy: checkin?.energy ?? null,
      tasksDone,
      focusMinutes,
      gratitude,
      checkin: !!checkin,
    });
  }
  res.json({ days });
});

/* ---------------- Export ---------------- */

function dumpAll() {
  const tables = all(
    `SELECT name FROM sqlite_master
     WHERE type='table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE 'document_fts%'
       AND name NOT LIKE 'memory_fts%'
       AND name NOT IN ('app_events')
     ORDER BY name`,
  ).map((t) => t.name);
  const data = {};
  for (const t of tables) {
    data[t] = all(`SELECT * FROM "${t}"`);
  }
  return data;
}

r.get('/export', (_req, res) => {
  res.json({ app: 'aish-aman', version: '0.1.0', exportedAt: new Date().toISOString(), data: dumpAll() });
});

r.post('/export/import', (req, res) => {
  const b = req.body || {};
  const data = b.data || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid export' });
  // Import only tables we know; guarded and best-effort per row.
  const known = new Set(
    all(`SELECT name FROM sqlite_master
         WHERE type='table'
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE 'document_fts%'
           AND name NOT LIKE 'memory_fts%'`).map((t) => t.name),
  );
  let imported = 0;
  for (const [table, rows] of Object.entries(data)) {
    if (!known.has(table) || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => {
        const info = get(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`, table, c);
        return !!info;
      });
      if (!cols.length) continue;
      const placeholders = cols.map(() => '?').join(',');
      try {
        run(`INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`, ...cols.map((c) => row[c]));
        imported += 1;
      } catch { /* skip incompatible rows */ }
    }
  }
  rebuildFts();
  logEvent('info', 'data', `Import completed: ${imported} rows`);
  res.json({ ok: true, imported });
});

export default r;
