import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, logEvent } from './db/index.js';
import { bootstrapEvents } from './services/bootstrap.js';
import { backfillActivity } from './services/activity.js';
import dataRoutes from './routes/data.js';
import studyWorkRoutes from './routes/study-work.js';
import studyRoutes from './routes/study.js';
import progressRoutes from './routes/progress.js';
import safeRoutes from './routes/safe.js';
import aiRoutes from './routes/ai.js';
import audioRoutes from './routes/audio.js';
import systemRoutes from './routes/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  openDb();
  logEvent('info', 'app', 'Aish Aman OS server started');
  bootstrapEvents();
  try {
    const backfilled = backfillActivity({ days: 90 });
    if (backfilled.added > 0) logEvent('info', 'app', `Activity index backfilled: ${backfilled.added} events`);
  } catch (e) {
    logEvent('error', 'app', 'Activity backfill failed: ' + e.message);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logging for developer mode.
  app.use((req, _res, next) => {
    if (process.env.AISH_DEBUG) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });

  app.use('/api', systemRoutes);
  app.use('/api', dataRoutes);
  app.use('/api', studyWorkRoutes);
  app.use('/api', studyRoutes);
  app.use('/api', progressRoutes);
  app.use('/api', safeRoutes);
  app.use('/api', aiRoutes);
  app.use('/api', audioRoutes);

  // Serve the built frontend when present.
  const distPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Final error handler.
  app.use((err, _req, res, _next) => {
    logEvent('error', 'app', `Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'internal_error', message: err.message });
  });

  return app;
}
