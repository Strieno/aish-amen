import { Router } from 'express';
import { progressSnapshot, claimChallenge } from '../services/progress.js';
import { whatsNext } from '../services/next-actions.js';
import { surprise } from '../services/surprise.js';
import { discoverInsights } from '../services/discoveries.js';

const r = Router();

/* ---------------- Gamification / progress ---------------- */

r.get('/progress', (_req, res) => {
  res.json(progressSnapshot());
});

r.post('/progress/challenges/:key/claim', (req, res) => {
  res.json(claimChallenge(req.params.key));
});

/* ---------------- What's next? ---------------- */

r.get('/insights/next', (_req, res) => {
  res.json({ actions: whatsNext({ limit: 3 }) });
});

/* ---------------- Surprise me ---------------- */

r.post('/surprise', async (_req, res) => {
  try {
    res.json(await surprise());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

/* ---------------- Cross-domain discoveries ---------------- */

r.get('/insights/discover', (_req, res) => {
  res.json({ discoveries: discoverInsights({ limit: 4 }) });
});

export default r;
