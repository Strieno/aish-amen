import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { uid, nowIso, parseJson, dateKey } from '../lib/util.js';
import { writeFileSync, existsSync, createReadStream, rmSync } from 'node:fs';
import path from 'node:path';
import { AUDIO_DIR } from '../db/index.js';
import { sha256Hex } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';

/** Safe, length-limited file name (also used for stored titles). */
export function sanitizeFileName(name, maxLen = 60) {
  const base = String(name || 'file')
    .replace(/[^\w.\-\u0600-\u06FF ]+/g, '_')
    .trim()
    .replace(/^\.+/, '');
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  const stem = ext ? base.slice(0, base.lastIndexOf('.')) : base;
  return `${stem.slice(0, maxLen - ext.length)}${ext}` || 'file';
}

const r = Router();

function audioOut(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseJson(row.tags, []),
    favorite: !!row.favorite,
    loop_enabled: !!row.loop_enabled,
    volume: Number(row.volume),
    url: `/api/audio/files/${row.id}/file`,
  };
}

/* ---------------- Audio files ---------------- */

r.get('/audio/files', (req, res) => {
  const rows = all('SELECT * FROM audio_files ORDER BY favorite DESC, created_at DESC').map(audioOut);
  res.json(rows);
});

r.post('/audio/import', async (req, res) => {
  const b = req.body || {};
  if (!b.filename || !b.data) return res.status(400).json({ error: 'filename and data required' });

  const raw = Buffer.from(String(b.data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  const hash = await sha256Hex(raw.toString('base64'));
  const existing = get('SELECT * FROM audio_files WHERE hash = ?', hash);
  if (existing) {
    return res.json({ duplicate: true, file: audioOut(existing) });
  }

  // Sanitize and shorten the stored filename: Windows paths must stay well
  // under 260 chars, so long titles (e.g. full track names) are truncated.
  const safeName = sanitizeFileName(b.filename, 60);
  const id = uid('audio-');
  const dest = path.join(AUDIO_DIR, `${id}-${safeName}`);
  writeFileSync(dest, raw);

  run(
    'INSERT INTO audio_files(id, title, path, category, duration, tags, favorite, volume, loop_enabled, fade_in, fade_out, notes, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    b.title || safeName,
    dest,
    b.category || 'sound',
    b.duration ?? null,
    JSON.stringify(b.tags || []),
    b.favorite ? 1 : 0,
    b.volume ?? 0.8,
    b.loop_enabled ? 1 : 0,
    b.fade_in ?? 0,
    b.fade_out ?? 0,
    b.notes || '',
    hash,
  );
  res.status(201).json({ duplicate: false, file: audioOut(get('SELECT * FROM audio_files WHERE id = ?', id)) });
});

r.get('/audio/files/:id/file', (req, res) => {
  const row = get('SELECT * FROM audio_files WHERE id = ?', req.params.id);
  if (!row || !existsSync(row.path)) return res.status(404).json({ error: 'file not found' });
  res.sendFile(path.resolve(row.path));
});

r.put('/audio/files/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE audio_files SET title=?, category=?, tags=?, favorite=?, volume=?, loop_enabled=?, fade_in=?, fade_out=?, notes=? WHERE id=?',
    b.title,
    b.category || 'sound',
    JSON.stringify(b.tags || []),
    b.favorite ? 1 : 0,
    b.volume ?? 0.8,
    b.loop_enabled ? 1 : 0,
    b.fade_in ?? 0,
    b.fade_out ?? 0,
    b.notes || '',
    req.params.id,
  );
  res.json(audioOut(get('SELECT * FROM audio_files WHERE id = ?', req.params.id)));
});

r.delete('/audio/files/:id', (req, res) => {
  const row = get('SELECT * FROM audio_files WHERE id = ?', req.params.id);
  if (row && existsSync(row.path)) {
    try {
      rmSync(row.path, { force: true });
    } catch { /* ignore */ }
  }
  run('DELETE FROM audio_files WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Presets ---------------- */

r.get('/audio/presets', (_req, res) => {
  res.json(
    all('SELECT * FROM audio_presets ORDER BY created_at').map((p) => ({
      ...p,
      tracks: parseJson(p.tracks, []),
    })),
  );
});
r.post('/audio/presets', (req, res) => {
  const b = req.body || {};
  const id = uid('preset-');
  run('INSERT INTO audio_presets(id, name, tracks) VALUES (?,?,?)', id, b.name || 'مزيج', JSON.stringify(b.tracks || []));
  res.status(201).json({ ...get('SELECT * FROM audio_presets WHERE id = ?', id), tracks: b.tracks || [] });
});
r.delete('/audio/presets/:id', (req, res) => {
  run('DELETE FROM audio_presets WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Sound Scenes ---------------- */

r.get('/audio/scenes', (_req, res) => {
  res.json(
    all('SELECT * FROM sound_scenes ORDER BY created_at').map((s) => ({
      ...s,
      tracks: parseJson(s.tracks, []),
      volume: Number(s.volume),
    })),
  );
});
r.post('/audio/scenes', (req, res) => {
  const b = req.body || {};
  const id = uid('scene-');
  run(
    'INSERT INTO sound_scenes(id, name, tracks, tts_voice, volume, timer_minutes, theme) VALUES (?,?,?,?,?,?,?)',
    id,
    b.name || 'مشهد',
    JSON.stringify(b.tracks || []),
    b.tts_voice || null,
    b.volume ?? 0.8,
    b.timer_minutes ?? null,
    b.theme || null,
  );
  res.status(201).json(get('SELECT * FROM sound_scenes WHERE id = ?', id));
});
r.delete('/audio/scenes/:id', (req, res) => {
  run('DELETE FROM sound_scenes WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Focus ---------------- */

r.get('/focus/sessions', (req, res) => {
  res.json(
    all(
      `SELECT f.*, t.title AS task_title FROM focus_sessions f
       LEFT JOIN tasks t ON t.id = f.task_id
       ORDER BY f.started_at DESC LIMIT ${Number(req.query.limit) || 50}`,
    ),
  );
});
r.post('/focus/start', (req, res) => {
  const b = req.body || {};
  const id = uid('focus-');
  run(
    'INSERT INTO focus_sessions(id, started_at, ended_at, minutes, task_id, completed) VALUES (?,?,?,?,?,?)',
    id,
    nowIso(),
    b.ended_at || null,
    b.minutes || 25,
    b.task_id || null,
    b.completed ? 1 : 0,
  );
  res.status(201).json(get('SELECT * FROM focus_sessions WHERE id = ?', id));
});
r.post('/focus/:id/complete', (req, res) => {
  run('UPDATE focus_sessions SET completed = 1, ended_at = ? WHERE id = ?', nowIso(), req.params.id);
  const row = get('SELECT * FROM focus_sessions WHERE id = ?', req.params.id);
  if (row) {
    emitDomainEvent(EVENT_TYPES.FOCUS_COMPLETED, { entityType: 'focus_session', entityId: row.id, minutes: row.minutes, date: row.started_at.slice(0, 10) });
  }
  res.json(row);
});
r.delete('/focus/:id', (req, res) => {
  run('DELETE FROM focus_sessions WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

export default r;
