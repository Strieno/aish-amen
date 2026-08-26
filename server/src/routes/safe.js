import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { uid, nowIso, parseJson, dateKey } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';

const r = Router();

function planOut(row) {
  if (!row) return null;
  return {
    ...row,
    immediate_actions: parseJson(row.immediate_actions, []),
    not_to_do: parseJson(row.not_to_do, []),
    resources: parseJson(row.resources, []),
    reminders: parseJson(row.reminders, []),
  };
}

/* ---------------- Safe Living Plans ---------------- */

r.get('/safe/plans', (_req, res) => {
  res.json(all('SELECT * FROM safe_living_plans ORDER BY created_at').map(planOut));
});
r.get('/safe/plans/:id', (req, res) => {
  const p = planOut(get('SELECT * FROM safe_living_plans WHERE id = ?', req.params.id));
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});
r.post('/safe/plans', (req, res) => {
  const b = req.body || {};
  const id = uid('plan-');
  run(
    'INSERT INTO safe_living_plans(id, name, trigger, signs, immediate_actions, not_to_do, resources, reminders, audio_scene, ai_instructions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    b.name || 'خطة جديدة',
    b.trigger || '',
    b.signs || '',
    JSON.stringify(b.immediate_actions || []),
    JSON.stringify(b.not_to_do || []),
    JSON.stringify(b.resources || []),
    JSON.stringify(b.reminders || []),
    b.audio_scene || null,
    b.ai_instructions || '',
    nowIso(),
    nowIso(),
  );
  res.status(201).json(planOut(get('SELECT * FROM safe_living_plans WHERE id = ?', id)));
});
r.put('/safe/plans/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE safe_living_plans SET name=?, trigger=?, signs=?, immediate_actions=?, not_to_do=?, resources=?, reminders=?, audio_scene=?, ai_instructions=?, updated_at=? WHERE id=?',
    b.name,
    b.trigger || '',
    b.signs || '',
    JSON.stringify(b.immediate_actions || []),
    JSON.stringify(b.not_to_do || []),
    JSON.stringify(b.resources || []),
    JSON.stringify(b.reminders || []),
    b.audio_scene || null,
    b.ai_instructions || '',
    nowIso(),
    req.params.id,
  );
  res.json(planOut(get('SELECT * FROM safe_living_plans WHERE id = ?', req.params.id)));
});
r.delete('/safe/plans/:id', (req, res) => {
  run('DELETE FROM safe_living_plans WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Safe Living Sessions ---------------- */

r.get('/safe/sessions', (_req, res) => {
  res.json(
    all(
      `SELECT s.*, p.name AS plan_name FROM safe_living_sessions s
       LEFT JOIN safe_living_plans p ON p.id = s.plan_id
       ORDER BY s.activated_at DESC LIMIT 20`,
    ),
  );
});
r.post('/safe/activate', (req, res) => {
  const { plan_id } = req.body || {};
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
  // Deactivate any active session, then activate the new one.
  run("UPDATE safe_living_sessions SET status = 'ended' WHERE status = 'active'");
  const id = uid('sls-');
  run('INSERT INTO safe_living_sessions(id, plan_id, status, notes) VALUES (?,?,?,?)', id, plan_id, 'active', '');
  const plan = get('SELECT name FROM safe_living_plans WHERE id = ?', plan_id);
  if (plan) {
    emitDomainEvent(EVENT_TYPES.SAFE_PLAN_ACTIVATED, { entityType: 'safe_living_plan', entityId: plan_id, title: plan.name, sessionId: id });
  }
  res.status(201).json(get('SELECT * FROM safe_living_sessions WHERE id = ?', id));
});
r.post('/safe/end', (_req, res) => {
  run("UPDATE safe_living_sessions SET status = 'ended' WHERE status = 'active'");
  res.json({ ok: true });
});

/* ---------------- Situation Analysis ---------------- */

/**
 * Structured non-diagnostic situation analysis.
 * The client may pass optional {text}; the server returns the framework
 * template plus a checklist, and (if a model is configured) an AI-assisted
 * analysis performed locally.
 */
r.post('/safe/analyze', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }
  const framework = {
    whatIsHappening: '',
    whatItMightMean: [],
    knownFacts: [],
    assumptions: [],
    controllable: [],
    notControllable: [],
    minSafeAction: '',
    questions: [
      'ما الذي يحدث الآن بالضبط؟',
      'ما الذي أعرفه بشكل مؤكد؟',
      'ما الذي أفترضه دون دليل؟',
      'ما الذي يقع تحت سيطرتي فعليًا؟',
      'ما أصغر خطوة مفيدة الآن؟',
      'ما الذي يمكن أن ينتظر بأمان؟',
    ],
  };
  res.json(framework);
});

/* ---------------- Daily / Safe-living estimate ---------------- */

r.get('/safe/status', (_req, res) => {
  // Non-diagnostic organizational estimate of today's load.
  const today = dateKey();
  const highPrio = all(
    "SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('done','cancelled') AND priority = 'high' AND (due_date IS NULL OR due_date = ?)",
    today,
  )[0]?.n || 0;
  const open = all(
    "SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('done','cancelled')",
  )[0]?.n || 0;
  const events = all('SELECT COUNT(*) AS n FROM calendar_events WHERE start LIKE ?', `${today}%`)[0]?.n || 0;
  const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today);

  let level = 'stable';
  let load = 0;
  if (checkin?.stress && checkin.stress >= 4) load += 2;
  if (checkin?.energy && checkin.energy <= 2) load += 2;
  if (highPrio >= 3) load += 2;
  if (highPrio >= 1 && highPrio < 3) load += 1;
  if (open >= 12) load += 1;
  if (events >= 6) load += 1;
  if (load >= 4) level = 'overloaded';
  else if (load >= 2) level = 'slightly-overloaded';
  else level = 'stable';

  res.json({ level, factors: { highPriority: highPrio, openTasks: open, eventsToday: events, hasCheckin: !!checkin } });
});

export default r;
