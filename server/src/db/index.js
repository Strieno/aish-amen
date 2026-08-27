import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DDL, FTS_SETUP, SCHEMA_VERSION } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// data/ lives next to the server package. Configurable via env for tests.
export const DATA_DIR = process.env.AISH_DATA_DIR
  ? path.resolve(process.env.AISH_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

export const DB_PATH = path.join(DATA_DIR, 'aish-aman.db');
export const DOCS_DIR = path.join(DATA_DIR, 'documents');
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureDirs() {
  for (const dir of [DATA_DIR, DOCS_DIR, AUDIO_DIR, ATTACH_DIR, BACKUP_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

let db = null;

export function getDb() {
  if (!db) throw new Error('Database not initialised');
  return db;
}

export function openDb() {
  ensureDirs();
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  seed(db);
  return db;
}

export function closeDb() {
  if (db) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    db = null;
  }
}

// Simple prepared-statement helpers for the sync API.
export function all(sql, ...params) {
  return getDb().prepare(sql).all(...params);
}
export function get(sql, ...params) {
  return getDb().prepare(sql).get(...params);
}
export function run(sql, ...params) {
  const res = getDb().prepare(sql).run(...params);
  return { lastInsertRowid: res.lastInsertRowid, changes: res.changes };
}
export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function migrate(d) {
  // Rebuild FTS tables each boot so a schema mismatch can never persist.
  d.exec('DROP TABLE IF EXISTS document_fts');
  d.exec('DROP TABLE IF EXISTS memory_fts');
  for (const stmt of DDL) d.exec(stmt);
  // Additive column migrations for databases created before a column existed.
  ensureColumn(d, 'memories', 'source_type', 'TEXT');
  ensureColumn(d, 'memories', 'source_id', 'TEXT');
  ensureColumn(d, 'conversations', 'context', 'TEXT');
  ensureColumn(d, 'conversations', 'mode', 'TEXT');
  ensureColumn(d, 'course_topics', 'mastery', 'REAL DEFAULT 0');
  ensureColumn(d, 'course_topics', 'difficulty', 'TEXT DEFAULT \'medium\'');
  ensureColumn(d, 'course_topics', 'last_reviewed', 'TEXT');
  ensureColumn(d, 'course_topics', 'review_count', 'INTEGER DEFAULT 0');
  d.exec('CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source_type, source_id)');
  d.exec(`INSERT INTO settings(key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
}

function ensureColumn(d, table, column, ddl) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function rebuildFts() {
  const d = getDb();
  for (const stmt of FTS_SETUP) d.exec(stmt);
  d.exec('DELETE FROM document_fts');
  d.exec(
    `INSERT INTO document_fts(chunk_id, content)
     SELECT id, content FROM document_chunks`,
  );
  d.exec('DELETE FROM memory_fts');
  d.exec(
    `INSERT INTO memory_fts(memory_id, content)
     SELECT id, content FROM memories WHERE archived = 0`,
  );
}

export function logEvent(level, category, message) {
  try {
    run(
      'INSERT INTO app_events(level, category, message) VALUES (?,?,?)',
      level,
      category,
      message,
    );
  } catch {
    /* event log must never crash the app */
  }
}

function seed(d) {
  const has = (sql) => !!d.prepare(sql).get();

  // Default settings
  const defaults = {
    language: 'ar',
    theme: 'dark',
    sidebarVisible: JSON.stringify(['today', 'chat', 'safe', 'tasks', 'study', 'work', 'journal', 'goals', 'gratitude', 'memory', 'knowledge', 'audio', 'focus', 'insights', 'settings']),
    userName: '',
    ai: JSON.stringify({ autoSpeak: false, contextBudget: { system: 1500, profile: 600, conversation: 4000, memories: 1500, rag: 3000, userMessage: 500, generation: 4000 } }),
    privacy: JSON.stringify({ maxPrivacy: false, blockCloud: false, analytics: false }),
    quietHours: JSON.stringify({ enabled: true, start: '00:00', end: '08:00', sound: true, spoken: true, visual: false }),
    audio: JSON.stringify({ master: 0.8, tts: 0.8, ambient: 0.6, notifications: 0.6 }),
    tts: JSON.stringify({ provider: null, voice: null }),
    stt: JSON.stringify({ provider: null, model: 'small' }),
    notifications: JSON.stringify({ enabled: true, taskComplete: true, focusComplete: true }),
    simpleMode: 'true',
  };
  if (!has("SELECT 1 FROM settings WHERE key='schema_version'")) {
    const ins = d.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?,?)');
    for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
  } else {
    const ins = d.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?,?)');
    for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
  }

  // Default AI providers
  if (!has('SELECT 1 FROM ai_providers')) {
    const ins = d.prepare(
      'INSERT OR IGNORE INTO ai_providers(id, type, name, base_url, embedding_model, timeout_ms, is_primary) VALUES (?,?,?,?,?,?,?)',
    );
    ins.run('prov-ollama', 'ollama', 'Ollama', 'http://localhost:11434', 'nomic-embed-text', 120000, 1);
    ins.run('prov-lmstudio', 'openai-compatible', 'LM Studio', 'http://localhost:1234/v1', null, 120000, 0);
    ins.run('prov-custom', 'openai-compatible', 'Custom Server', 'http://localhost:8000/v1', null, 120000, 0);
    ins.run('prov-mock', 'mock', 'Mock (built-in test)', null, null, 5000, 0);
  }

  // Default assistants / personas
  if (!has('SELECT 1 FROM assistants')) {
    const ins = d.prepare(
      'INSERT INTO assistants(id, name, slug, description, system_prompt, model, provider_id, temperature, context_limit, memory_permissions, tool_permissions, voice, response_style, knowledge_base_ids, is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    ins.run(
      'asst-general',
      'المساعد العام',
      'general',
      'مساعد يومي شامل بأسلوب هادئ',
      null,
      null,
      'prov-ollama',
      0.6,
      8192,
      JSON.stringify({ memory: true, tasks: true, journal: true }),
      JSON.stringify(['read_tasks', 'search_memory', 'search_knowledge', 'get_schedule']),
      null,
      'balanced',
      null,
      1,
    );
    ins.run(
      'asst-safe',
      'مساعد العيش الآمن',
      'safe-living',
      'يساعد على تحليل المواقف بهدوء وتقليل الضغط',
      null,
      null,
      'prov-ollama',
      0.5,
      8192,
      JSON.stringify({ memory: true, tasks: true, journal: false, checkins: true }),
      JSON.stringify(['read_tasks', 'get_schedule', 'search_memory']),
      null,
      'calm',
      null,
      0,
    );
    ins.run(
      'asst-study',
      'مرشد الدراسة',
      'study',
      'معلم خصوصي للدراسة الجامعية',
      null,
      null,
      'prov-ollama',
      0.4,
      8192,
      JSON.stringify({ memory: false, tasks: true, study: true }),
      JSON.stringify(['read_tasks', 'get_course', 'search_knowledge', 'get_schedule']),
      null,
      'academic',
      JSON.stringify(['kb-university']),
      0,
    );
    ins.run(
      'asst-programming',
      'مساعد البرمجة',
      'programming',
      'مساعد برمجة تقني',
      null,
      null,
      'prov-ollama',
      0.2,
      16384,
      JSON.stringify({ memory: false }),
      JSON.stringify(['search_knowledge']),
      null,
      'technical',
      JSON.stringify(['kb-programming']),
      0,
    );
    ins.run(
      'asst-work',
      'مساعد العمل',
      'work',
      'مساعد العمل والمناوبات',
      null,
      null,
      'prov-ollama',
      0.5,
      8192,
      JSON.stringify({ memory: false, work: true }),
      JSON.stringify(['read_tasks', 'get_schedule']),
      null,
      'concise',
      null,
      0,
    );
    ins.run(
      'asst-journal',
      'محلل اليوميات',
      'journal',
      'يستعرض اليوميات ويقدم ملاحظات هادئة',
      null,
      null,
      'prov-ollama',
      0.5,
      8192,
      JSON.stringify({ memory: false, journal: true }),
      JSON.stringify([]),
      null,
      'reflective',
      null,
      0,
    );
  }

  // Default safe living plan templates
  if (!has('SELECT 1 FROM safe_living_plans')) {
    const ins = d.prepare(
      'INSERT INTO safe_living_plans(id, name, trigger, signs, immediate_actions, not_to_do, resources, reminders, ai_instructions) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    ins.run(
      'plan-overloaded',
      'يوم مرهق',
      'الشعور بضغط أو إرهاق شديد',
      'تشتت، صعوبة في التركيز، رغبة في التوقف',
      JSON.stringify(['تنفس لمدة دقيقة', 'اكتب أهم شيء واحد فقط', 'أكمل خطوة صغيرة واحدة']),
      JSON.stringify(['لا تتخذ قرارات كبيرة الآن', 'لا تفتح الهاتف بلا هدف']),
      JSON.stringify([]),
      JSON.stringify(['"بضغطة واحدة لا تغيّر كل شيء"', '"الراحة مسموحة"']),
      'قلل المهام إلى الضروري، وامنح الأولوية للخطوة الأصغر.',
    );
    ins.run(
      'plan-exam',
      'امتحان جامعي',
      'اقتراب موعد امتحان',
      'قلق، رغبة في المراجعة بسرعة',
      JSON.stringify(['راجع الملخص أولاً', 'حل 3 أسئلة تدريبية', 'نم مبكراً']),
      JSON.stringify(['لا تسهر للمذاكرة', 'لا تبدأ مواضيع جديدة ليلة الامتحان']),
      JSON.stringify([]),
      JSON.stringify(['"ركّز على ما تعرفه"']),
      'ساعد على وضع خطة مراجعة واقعية حسب الوقت المتبقي.',
    );
    ins.run(
      'plan-low-energy',
      'طاقة منخفضة',
      'يوم بطاقة قليلة',
      'خمول، إرهاق، رغبة في الراحة',
      JSON.stringify(['اختر المهمة الأخف', 'اشرب ماء', 'خذ استراحة قصيرة']),
      JSON.stringify(['لا تخطط لمهام ثقيلة']),
      JSON.stringify([]),
      JSON.stringify(['"استراحتك لا تحتاج تبريراً"']),
      'اقترح مهام منخفضة الطاقة فقط وحدد خطة يوم بسيطة.',
    );
  }

  // Default knowledge base
  if (!has('SELECT 1 FROM knowledge_bases')) {
    const ins = d.prepare(
      'INSERT OR IGNORE INTO knowledge_bases(id, name, description) VALUES (?,?,?)',
    );
    ins.run('kb-university', 'الجامعة', 'مواد ومحاضرات الجامعة');
    ins.run('kb-programming', 'البرمجة', 'ملاحظات ووثائق برمجية');
    ins.run('kb-personal', 'ملاحظات شخصية', 'ملاحظات خاصة');
  }

  // Default focus goal life area
  if (!has('SELECT 1 FROM goals')) {
    run('INSERT INTO goals(id, title, life_area, status) VALUES (?,?,?,?)', 'goal-sample', 'نموذج هدف — يمكن تعديله أو حذفه', 'education', 'active');
  }

  rebuildFts();
}
