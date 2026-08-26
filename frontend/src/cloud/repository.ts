import { requireSupabase } from './client';
import {
  cacheRows,
  getCachedRow,
  getCachedRows,
  queueMutation,
  queuedMutations,
  removeCachedRow,
  removeQueuedMutation,
} from './cache';
import { useCloudStore } from './store';

export type CloudRow = Record<string, unknown> & { id?: string; user_id?: string; updated_at?: string };

function isNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return !navigator.onLine || /fetch|network|offline|timeout/i.test(message);
}

function publicRow(row: CloudRow) {
  const { user_id: _userId, ...rest } = row;
  return rest;
}

async function currentUserId() {
  const { data } = await requireSupabase().auth.getSession();
  if (!data.session?.user) throw new Error('Authentication required');
  return data.session.user.id;
}

export class CloudRepository {
  constructor(readonly table: string, readonly idPrefix = '') {}

  createId() {
    return `${this.idPrefix}${crypto.randomUUID()}`;
  }

  async list(filters: Record<string, unknown> = {}, options: { order?: string; ascending?: boolean; limit?: number } = {}) {
    const userId = await currentUserId();
    try {
      let query = requireSupabase().from(this.table).select('*').eq('user_id', userId);
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') query = query.eq(key, value);
      }
      if (options.order) query = query.order(options.order, { ascending: options.ascending ?? true });
      if (options.limit) query = query.limit(options.limit);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as CloudRow[];
      await cacheRows(userId, this.table, rows);
      useCloudStore.getState().setStatus('synced');
      return rows.map(publicRow);
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      useCloudStore.getState().setStatus('offline', 'سيتم إرسال التغييرات عند عودة الاتصال');
      return (await getCachedRows(userId, this.table)).map((row) => publicRow(row as CloudRow));
    }
  }

  async get(id: string) {
    const userId = await currentUserId();
    try {
      const { data, error } = await requireSupabase()
        .from(this.table)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (data) await cacheRows(userId, this.table, [data as CloudRow]);
      return data ? publicRow(data as CloudRow) : null;
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      const cached = await getCachedRow(userId, this.table, id);
      return cached ? publicRow(cached as CloudRow) : null;
    }
  }

  async create(input: CloudRow) {
    const id = String(input.id || this.createId());
    const now = new Date().toISOString();
    return this.upsert({ ...input, id, created_at: input.created_at || now, updated_at: now });
  }

  async update(id: string, patch: CloudRow) {
    const current = (await this.get(id)) || {};
    return this.upsert({ ...current, ...patch, id, updated_at: new Date().toISOString() });
  }

  async upsert(input: CloudRow) {
    const userId = await currentUserId();
    const row: CloudRow = { ...input, user_id: userId, updated_at: input.updated_at || new Date().toISOString() };
    const id = String(row.id || '');
    if (!id) throw new Error(`Missing id for ${this.table}`);
    await cacheRows(userId, this.table, [row]);
    try {
      const { data, error } = await requireSupabase()
        .from(this.table)
        .upsert(row, { onConflict: 'user_id,id' })
        .select('*')
        .single();
      if (error) throw error;
      await cacheRows(userId, this.table, [data as CloudRow]);
      useCloudStore.getState().markSynced();
      return publicRow(data as CloudRow);
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      await queueMutation({
        key: `${userId}:${this.table}:${id}`,
        userId,
        table: this.table,
        recordId: id,
        operation: 'upsert',
        row,
        queuedAt: new Date().toISOString(),
      });
      const pending = (await queuedMutations(userId)).length;
      useCloudStore.getState().setPending(pending);
      useCloudStore.getState().setStatus('offline', 'حُفظ التغيير على الجهاز وسيُزامن تلقائيًا');
      return publicRow(row);
    }
  }

  async delete(id: string) {
    const userId = await currentUserId();
    await removeCachedRow(userId, this.table, id);
    try {
      const { error } = await requireSupabase().from(this.table).delete().eq('user_id', userId).eq('id', id);
      if (error) throw error;
      useCloudStore.getState().markSynced();
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      await queueMutation({
        key: `${userId}:${this.table}:${id}`,
        userId,
        table: this.table,
        recordId: id,
        operation: 'delete',
        queuedAt: new Date().toISOString(),
      });
      const pending = (await queuedMutations(userId)).length;
      useCloudStore.getState().setPending(pending);
      useCloudStore.getState().setStatus('offline', 'حُفظ الحذف على الجهاز وسيُزامن تلقائيًا');
    }
    return { ok: true };
  }
}

export async function flushOfflineQueue(userId?: string) {
  const resolvedUserId = userId || (await currentUserId());
  if (!navigator.onLine) return;
  const dependencyOrder = [
    'ai_provider_profiles','ai_models','assistants','conversation_folders','conversations','messages',
    'memories','goals','courses','projects','tasks','goal_milestones','journal_entries','journal_attachments',
    'gratitude_entries','calendar_events','checkins','course_topics','exams','work_shifts','work_notes',
    'knowledge_bases','documents','document_chunks','audio_files','audio_presets','sound_scenes','focus_sessions',
    'safe_living_plans','safe_living_sessions','automation_rules','notifications','entity_links','link_suggestions',
    'activity_events','user_settings',
  ];
  const orderOf = (table: string) => {
    const index = dependencyOrder.indexOf(table);
    return index === -1 ? dependencyOrder.length : index;
  };
  const queue = (await queuedMutations(resolvedUserId)).sort((a, b) => {
    if (a.operation !== b.operation) return a.operation === 'upsert' ? -1 : 1;
    const direction = a.operation === 'delete' ? -1 : 1;
    return direction * (orderOf(a.table) - orderOf(b.table)) || a.queuedAt.localeCompare(b.queuedAt);
  });
  useCloudStore.getState().setPending(queue.length);
  if (!queue.length) {
    useCloudStore.getState().markSynced();
    return;
  }
  useCloudStore.getState().setStatus('syncing');
  for (const mutation of queue) {
    const query = requireSupabase().from(mutation.table);
    const idColumn = mutation.idColumn || 'id';
    const { error } = mutation.operation === 'delete'
      ? await query.delete().eq('user_id', resolvedUserId).eq(idColumn, mutation.recordId)
      : await query.upsert(mutation.row || {}, { onConflict: mutation.conflict || 'user_id,id' });
    if (error) {
      useCloudStore.getState().setStatus('error', error.message);
      return;
    }
    await removeQueuedMutation(mutation.key);
  }
  useCloudStore.getState().markSynced();
}
