import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, DOCS_DIR, AUDIO_DIR, ATTACH_DIR, DB_PATH, getDb, closeDb, openDb, rebuildFts, logEvent } from '../db/index.js';

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

export function listBackups() {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((name) => statSync(path.join(BACKUP_DIR, name)).isDirectory())
    .map((name) => {
      const p = path.join(BACKUP_DIR, name);
      let size = 0;
      const walk = (dir) => {
        for (const e of readdirSync(dir)) {
          const f = path.join(dir, e);
          if (statSync(f).isDirectory()) walk(f);
          else size += statSync(f).size;
        }
      };
      try {
        walk(p);
      } catch { /* ignore */ }
      return { id: name, createdAt: statSync(p).mtime.toISOString(), sizeBytes: size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `backup-${stamp}`);
  mkdirSync(target, { recursive: true });
  const db = getDb();
  const buffer = db.serialize();
  writeFileSync(path.join(target, 'database.db'), buffer);
  copyDir(DOCS_DIR, path.join(target, 'documents'));
  copyDir(AUDIO_DIR, path.join(target, 'audio'));
  copyDir(ATTACH_DIR, path.join(target, 'attachments'));
  logEvent('info', 'backup', `Backup created: ${stamp}`);
  return { id: path.basename(target), createdAt: new Date().toISOString() };
}

export function deleteBackup(id) {
  const target = path.join(BACKUP_DIR, id);
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error('Backup not found');
  }
  if (!id.startsWith('backup-')) throw new Error('Invalid backup id');
  rmSync(target, { recursive: true, force: true });
}

export function restoreBackup(id) {
  const target = path.join(BACKUP_DIR, id);
  const dbFile = path.join(target, 'database.db');
  if (!existsSync(dbFile)) throw new Error('Backup database missing');

  closeDb();

  // Replace database file (and remove WAL/SHM so a clean snapshot is used).
  for (const suffix of ['', '-wal', '-shm']) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p, { force: true });
  }
  copyFileSync(dbFile, DB_PATH);

  const restoreDir = (src, dest) => {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    copyDir(src, dest);
  };
  restoreDir(path.join(target, 'documents'), DOCS_DIR);
  restoreDir(path.join(target, 'audio'), AUDIO_DIR);
  restoreDir(path.join(target, 'attachments'), ATTACH_DIR);

  openDb();
  rebuildFts();
  logEvent('info', 'backup', `Backup restored: ${id}`);
  return { ok: true };
}
