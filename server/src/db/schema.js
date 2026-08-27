export const SCHEMA_VERSION = 1;

// Ordered list of DDL statements. Each statement is idempotent so the app can
// boot against any prior state without a destructive migration.
export const DDL = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '{}'
  )`,

  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('ollama','openai-compatible','mock')),
    name TEXT NOT NULL,
    base_url TEXT,
    api_key TEXT,
    headers TEXT,
    embedding_model TEXT,
    timeout_ms INTEGER DEFAULT 120000,
    is_primary INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS ai_models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    display_name TEXT,
    context_limit INTEGER,
    capabilities TEXT,
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS assistants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    system_prompt TEXT,
    model TEXT,
    provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
    temperature REAL DEFAULT 0.6,
    context_limit INTEGER,
    memory_permissions TEXT,
    tool_permissions TEXT,
    voice TEXT,
    response_style TEXT,
    knowledge_base_ids TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    assistant_id TEXT REFERENCES assistants(id) ON DELETE SET NULL,
    provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
    model TEXT,
    folder TEXT,
    pinned INTEGER DEFAULT 0,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
    content TEXT NOT NULL DEFAULT '',
    model TEXT,
    provider TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    generation_ms INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    importance REAL DEFAULT 0.5,
    source TEXT,
    source_type TEXT,
    source_id TEXT,
    confidence REAL DEFAULT 0.5,
    tags TEXT,
    pinned INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    ai_access INTEGER DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS conversation_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS memory_tags (
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (memory_id, tag)
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    energy TEXT DEFAULT 'medium',
    est_minutes INTEGER,
    due_date TEXT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
    tags TEXT,
    status TEXT DEFAULT 'inbox',
    recurring_rule TEXT,
    dependencies TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
    workspace TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    life_area TEXT,
    target_date TEXT,
    status TEXT DEFAULT 'active',
    progress REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS goal_milestones (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    entry_date TEXT NOT NULL,
    tags TEXT,
    mood TEXT,
    ai_access INTEGER DEFAULT 1,
    ai_summary TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS journal_attachments (
    id TEXT PRIMARY KEY,
    journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS gratitude_entries (
    id TEXT PRIMARY KEY,
    items TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT,
    category TEXT DEFAULT 'general',
    location TEXT,
    notes TEXT DEFAULT '',
    reminders TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    entry_date TEXT NOT NULL,
    energy INTEGER,
    stress INTEGER,
    sleep_hours REAL,
    concern TEXT DEFAULT '',
    success TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    credit_hours REAL DEFAULT 3,
    instructor TEXT,
    semester TEXT,
    target_grade TEXT,
    notes TEXT DEFAULT '',
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS course_topics (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT DEFAULT '',
    done INTEGER DEFAULT 0,
    mastery REAL DEFAULT 0,
    difficulty TEXT DEFAULT 'medium',
    last_reviewed TEXT,
    review_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    topic_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    minutes INTEGER DEFAULT 0,
    type TEXT DEFAULT 'study',
    difficulty_felt TEXT,
    understanding INTEGER,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS study_notes (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    topic_id TEXT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    topic_id TEXT,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    ease REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 0,
    reps INTEGER DEFAULT 0,
    lapses INTEGER DEFAULT 0,
    due_date TEXT,
    last_reviewed TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    topic_id TEXT,
    question TEXT NOT NULL,
    answer TEXT,
    correct INTEGER,
    confidence INTEGER DEFAULT 0,
    difficulty TEXT DEFAULT 'medium',
    source TEXT DEFAULT 'practice',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS mistakes (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    topic_id TEXT,
    category TEXT DEFAULT 'concept',
    question TEXT NOT NULL,
    user_answer TEXT,
    correct_answer TEXT,
    times INTEGER DEFAULT 1,
    last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    resolved INTEGER DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS study_plan_items (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    course_id TEXT,
    topic_id TEXT,
    minutes INTEGER DEFAULT 30,
    done INTEGER DEFAULT 0,
    reason TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    exam_type TEXT DEFAULT 'OTHER',
    exam_date TEXT,
    weight REAL,
    grade REAL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS work_shifts (
    id TEXT PRIMARY KEY,
    shift_start TEXT NOT NULL,
    shift_end TEXT,
    role TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS work_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    hash TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    page_count INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    tokens INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS audio_files (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    category TEXT DEFAULT 'sound',
    duration REAL,
    tags TEXT,
    favorite INTEGER DEFAULT 0,
    volume REAL DEFAULT 0.8,
    loop_enabled INTEGER DEFAULT 0,
    fade_in REAL DEFAULT 0,
    fade_out REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    hash TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS audio_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tracks TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sound_scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tracks TEXT,
    tts_voice TEXT,
    volume REAL DEFAULT 0.8,
    timer_minutes INTEGER,
    theme TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS focus_sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    minutes INTEGER NOT NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    completed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS safe_living_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    trigger TEXT DEFAULT '',
    signs TEXT DEFAULT '',
    immediate_actions TEXT,
    not_to_do TEXT,
    resources TEXT,
    reminders TEXT,
    audio_scene TEXT,
    ai_instructions TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS safe_living_sessions (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES safe_living_plans(id) ON DELETE SET NULL,
    activated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    status TEXT DEFAULT 'active',
    notes TEXT DEFAULT ''
  )`,

  `CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    trigger TEXT NOT NULL,
    actions TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    due_at TEXT,
    category TEXT DEFAULT 'general',
    seen INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS app_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT DEFAULT 'info',
    category TEXT DEFAULT 'app',
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS entity_links (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'related_to',
    confidence REAL DEFAULT 1,
    created_by TEXT DEFAULT 'user',
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS link_suggestions (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'related_to',
    confidence REAL DEFAULT 0.5,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    ts TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    unlocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,

  `CREATE TABLE IF NOT EXISTS daily_challenges (
    date TEXT NOT NULL,
    challenge_key TEXT NOT NULL,
    done INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (date, challenge_key)
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_date ON checkins(entry_date)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(entry_date)`,
  `CREATE INDEX IF NOT EXISTS idx_links_source ON entity_links(source_type, source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_target ON entity_links(target_type, target_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_links_unique ON entity_links(source_type, source_id, target_type, target_id, relationship_type)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_events(entity_type, entity_id)`,
];

export const FTS_SETUP = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(chunk_id UNINDEXED, content, tokenize='unicode61')`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(memory_id UNINDEXED, content, tokenize='unicode61')`,
];
