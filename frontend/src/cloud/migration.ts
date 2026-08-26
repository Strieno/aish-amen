import { apiBaseUrl, requireSupabase } from './client';
import { putMeta } from './cache';
import { useCloudStore } from './store';

interface LegacyExport {
  app: string;
  exportedAt?: string;
  data: Record<string, Record<string, unknown>[]>;
}

const TABLE_ORDER = [
  'ai_providers', 'ai_models', 'assistants', 'conversation_folders', 'conversations', 'messages',
  'memories', 'memory_tags', 'goals', 'courses', 'projects', 'tasks', 'goal_milestones',
  'journal_entries', 'journal_attachments', 'gratitude_entries', 'calendar_events', 'checkins',
  'course_topics', 'exams', 'work_shifts', 'work_notes', 'knowledge_bases', 'documents',
  'document_chunks', 'audio_files', 'audio_presets', 'sound_scenes', 'focus_sessions',
  'safe_living_plans', 'safe_living_sessions', 'automation_rules', 'notifications',
  'entity_links', 'link_suggestions', 'activity_events',
] as const;

const JSON_COLUMNS = new Set([
  'capabilities', 'memory_permissions', 'tool_permissions', 'knowledge_base_ids', 'tags', 'context',
  'metadata', 'dependencies', 'items', 'reminders', 'tracks', 'immediate_actions', 'not_to_do',
  'resources', 'trigger', 'actions',
]);

const BOOLEAN_COLUMNS = new Set([
  'is_primary', 'is_default', 'pinned', 'archived', 'ai_access', 'done', 'favorite',
  'loop_enabled', 'completed', 'enabled', 'seen',
]);

const TABLE_RENAME: Record<string, string> = {
  ai_providers: 'ai_provider_profiles',
};

function parseLegacyJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function transformRow(table: string, row: Record<string, unknown>, userId: string) {
  const next: Record<string, unknown> = { ...row, user_id: userId };
  delete next.api_key;
  delete next.headers;
  for (const [key, value] of Object.entries(next)) {
    if (JSON_COLUMNS.has(key)) next[key] = parseLegacyJson(value);
    if (BOOLEAN_COLUMNS.has(key)) next[key] = value === true || value === 1 || value === '1';
  }
  const now = new Date().toISOString();
  if (!next.created_at) next.created_at = now;
  if (!next.updated_at) next.updated_at = String(next.created_at || now);
  if (table === 'ai_providers') {
    delete next.has_api_key;
  }
  return next;
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function migrateSettings(rows: Record<string, unknown>[], userId: string) {
  const payload = rows.map((row) => ({
    user_id: userId,
    key: String(row.key),
    value: parseLegacyJson(row.value),
    updated_at: new Date().toISOString(),
  }));
  if (!payload.length) return 0;
  const { error } = await requireSupabase().from('user_settings').upsert(payload, { onConflict: 'user_id,key' });
  if (error) throw error;
  return payload.length;
}

async function migrateProfile(rows: Record<string, unknown>[], userId: string) {
  const first = rows[0];
  if (!first) return 0;
  const { error } = await requireSupabase().from('profiles').upsert({
    user_id: userId,
    name: String(first.name || ''),
    avatar: first.avatar || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return 1;
}

async function migrateTable(table: string, rows: Record<string, unknown>[], userId: string) {
  if (!rows.length) return 0;
  const target = TABLE_RENAME[table] || table;
  let imported = 0;
  for (let index = 0; index < rows.length; index += 150) {
    const batch = rows.slice(index, index + 150).map((row) => transformRow(table, row, userId));
    const conflict = table === 'memory_tags' ? 'user_id,memory_id,tag' : 'user_id,id';

    // Do not replace a newer cloud record with an older SQLite copy.
    let toWrite = batch;
    if (table !== 'memory_tags') {
      const ids = batch.map((row) => String(row.id || '')).filter(Boolean);
      const { data: existing, error: existingError } = await requireSupabase()
        .from(target)
        .select('id,updated_at')
        .eq('user_id', userId)
        .in('id', ids);
      if (existingError) throw existingError;
      const remoteTime = new Map((existing || []).map((row) => [String(row.id), Date.parse(String(row.updated_at || 0))]));
      toWrite = batch.filter((row) => {
        const remote = remoteTime.get(String(row.id));
        return remote === undefined || Date.parse(String(row.updated_at || 0)) > remote;
      });
    }
    if (!toWrite.length) continue;
    const { error } = await requireSupabase().from(target).upsert(toWrite, { onConflict: conflict });
    if (error) throw error;
    imported += toWrite.length;
  }
  return imported;
}

export async function migrateLegacySqlite(userId: string) {
  try {
    const response = await fetch(`${apiBaseUrl}/export`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return { available: false, imported: 0 };
    const legacy = (await response.json()) as LegacyExport;
    if (legacy.app !== 'aish-aman' || !legacy.data) return { available: false, imported: 0 };

    const serialized = JSON.stringify(legacy);
    const fingerprint = await sha256(serialized);
    const { data: previous, error: previousError } = await requireSupabase()
      .from('migration_runs')
      .select('source_fingerprint')
      .eq('user_id', userId)
      .eq('source', 'sqlite-export')
      .eq('source_fingerprint', fingerprint)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous) return { available: true, imported: 0, alreadyMigrated: true };

    // Keep an untouched browser-side backup before any cloud write.
    await putMeta(`legacy-backup:${userId}:${fingerprint}`, legacy);
    useCloudStore.getState().setStatus('syncing', 'جارٍ نقل بياناتك المحلية بأمان…');

    const counts: Record<string, number> = {};
    counts.profiles = await migrateProfile(legacy.data.profiles || [], userId);
    counts.settings = await migrateSettings(legacy.data.settings || [], userId);
    for (const table of TABLE_ORDER) {
      counts[table] = await migrateTable(table, legacy.data[table] || [], userId);
    }

    const imported = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const { error } = await requireSupabase().from('migration_runs').insert({
      user_id: userId,
      source: 'sqlite-export',
      source_fingerprint: fingerprint,
      row_counts: counts,
    });
    if (error) throw error;
    await putMeta(`legacy-migration:${userId}`, { fingerprint, counts, imported, completedAt: new Date().toISOString() });
    useCloudStore.getState().markSynced();
    return { available: true, imported, counts };
  } catch (error) {
    // A failed migration never touches/deletes SQLite. A later login retries safely.
    const message = error instanceof Error ? error.message : 'تعذر نقل البيانات المحلية';
    useCloudStore.getState().setStatus('error', message);
    return { available: true, imported: 0, error: message };
  }
}

export async function inspectLegacySqlite() {
  try {
    const response = await fetch(`${apiBaseUrl}/export`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return { available: false, total: 0, counts: {} as Record<string, number> };
    const legacy = (await response.json()) as LegacyExport;
    if (legacy.app !== 'aish-aman' || !legacy.data) return { available: false, total: 0, counts: {} as Record<string, number> };
    const supported = new Set<string>(['profiles', 'settings', ...TABLE_ORDER]);
    const counts = Object.fromEntries(Object.entries(legacy.data).filter(([table]) => supported.has(table)).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0]));
    return {
      available: true,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
      exportedAt: legacy.exportedAt || null,
    };
  } catch {
    return { available: false, total: 0, counts: {} as Record<string, number> };
  }
}
