# Database

SQLite via Node's built-in `node:sqlite` (no native compilation). One file:

```
server/data/aish-aman.db
```

- `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` at open.
- The schema is declared in `server/src/db/schema.js` and applied idempotently
  (`CREATE TABLE IF NOT EXISTS ...`) plus explicit indexes on every boot. `schema_version`
  is tracked in the `settings` table; future migrations add numbered statements.
- FTS5 virtual tables (`memory_fts`, `document_fts`) are **rebuilt on every boot** and after
  every write, so a schema mismatch can never persist. Search queries are sanitized
  (`ftsQuery` strips FTS syntax and quotes tokens) and FTS results are merged with a LIKE
  fallback so Arabic affixes ("بالعربية" ⊇ "العربية") still match.

## Tables

| Table | Purpose |
| --- | --- |
| `settings` | namespaced key/value (language, theme, AI config, privacy, quiet hours…) |
| `profiles` | future multi-profile support |
| `ai_providers`, `ai_models` | connections + discovered models |
| `assistants` | personas: system prompt, model, temperature, memory/tool permissions |
| `conversations`, `messages` | chat history with `parent_message_id` (branching-ready) |
| `memories`, `memory_tags` | long-term memory (importance, confidence, ai_access, pinned) |
| `tasks`, `projects`, `goals`, `goal_milestones` | planning hierarchy |
| `journal_entries`, `journal_attachments` | journal with per-entry `ai_access` |
| `gratitude_entries` | daily gratitude |
| `calendar_events` | events with reminders |
| `checkins` | energy/stress/sleep check-in (unique per day) |
| `courses`, `course_topics`, `exams` | study module |
| `work_shifts`, `work_notes` | work module |
| `knowledge_bases`, `documents`, `document_chunks` | RAG corpus |
| `audio_files`, `audio_presets`, `sound_scenes` | sound library + mixer presets + scenes |
| `focus_sessions` | pomodoro logs |
| `safe_living_plans`, `safe_living_sessions` | safe-living plans + active session |
| `automation_rules` | (reserved) automation engine |
| `notifications` | (reserved) notification queue |
| `app_events` | non-sensitive debug event log |

## Transactions

Compound operations use explicit transactions: knowledge-base deletion (documents + chunks +
files) and message persistence (user + assistant + conversation touch) are atomic. `db/index.js`
exports `transaction(fn)`.

## Backups & export

- **Backup**: `db.serialize()` → `database.db` + recursive copies of
  `documents/`, `audio/`, `attachments/` into `data/backups/backup-<timestamp>/`.
- **Restore**: closes the DB, replaces `database.db` (WAL/SHM removed), restores folders,
  reopens, rebuilds FTS.
- **Export**: full JSON of every non-virtual table via `/api/export`.
- **Import**: best-effort `INSERT OR REPLACE` into known tables.
