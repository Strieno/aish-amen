import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CachedRecord {
  key: string;
  userId: string;
  table: string;
  id: string;
  row: Record<string, unknown>;
  updatedAt: string;
}

export interface QueuedMutation {
  key: string;
  userId: string;
  table: string;
  recordId: string;
  operation: 'upsert' | 'delete';
  row?: Record<string, unknown>;
  idColumn?: string;
  conflict?: string;
  queuedAt: string;
}

interface CloudDb extends DBSchema {
  records: {
    key: string;
    value: CachedRecord;
    indexes: { 'by-user-table': [string, string] };
  };
  queue: {
    key: string;
    value: QueuedMutation;
    indexes: { 'by-user': string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown; updatedAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<CloudDb>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<CloudDb>('aishaman-cloud', 1, {
      upgrade(database) {
        const records = database.createObjectStore('records', { keyPath: 'key' });
        records.createIndex('by-user-table', ['userId', 'table']);
        const queue = database.createObjectStore('queue', { keyPath: 'key' });
        queue.createIndex('by-user', 'userId');
        database.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

const recordKey = (userId: string, table: string, id: string) => `${userId}:${table}:${id}`;

export async function cacheRows(userId: string, table: string, rows: Record<string, unknown>[]) {
  const database = await db();
  const tx = database.transaction('records', 'readwrite');
  for (const row of rows) {
    const id = String(row.id ?? row.key ?? '');
    if (!id) continue;
    await tx.store.put({
      key: recordKey(userId, table, id),
      userId,
      table,
      id,
      row,
      updatedAt: String(row.updated_at || new Date().toISOString()),
    });
  }
  await tx.done;
}

export async function getCachedRows(userId: string, table: string) {
  const rows = await (await db()).getAllFromIndex('records', 'by-user-table', [userId, table]);
  return rows.map((item) => item.row);
}

export async function getCachedRow(userId: string, table: string, id: string) {
  return (await (await db()).get('records', recordKey(userId, table, id)))?.row || null;
}

export async function removeCachedRow(userId: string, table: string, id: string) {
  await (await db()).delete('records', recordKey(userId, table, id));
}

export async function queueMutation(mutation: QueuedMutation) {
  await (await db()).put('queue', mutation);
}

export async function queuedMutations(userId: string) {
  const list = await (await db()).getAllFromIndex('queue', 'by-user', userId);
  return list.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueuedMutation(key: string) {
  await (await db()).delete('queue', key);
}

export async function putMeta(key: string, value: unknown) {
  await (await db()).put('meta', { key, value, updatedAt: new Date().toISOString() });
}

export async function getMeta<T>(key: string): Promise<T | null> {
  return ((await (await db()).get('meta', key))?.value as T | undefined) ?? null;
}
