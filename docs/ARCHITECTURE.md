# Architecture

## Overview

Aish Aman OS is a **local-first desktop web application** split into two processes:

1. **`server/`** — Node.js (Express) backend on port `4321`.
   - Owns all state (SQLite via the built-in `node:sqlite`, managed files under `server/data/`).
   - Exposes a REST API plus one SSE endpoint (`POST /api/chat/stream`) for streaming AI.
   - Orchestrates AI providers, prompt building, context, memory, RAG, backups.
2. **`frontend/`** — React + TypeScript + Vite + Tailwind SPA.
   - In development it runs on port `5173` and proxies `/api` to the backend (no CORS).
   - In production the backend serves `frontend/dist`.

Everything is synchronous and single-process by design (one user, local machine), which keeps
the system reliable and easy to reason about. Async work (model requests, streaming) uses
async/await and streams.

## Layer layout

```
HTTP
 │
 ├─ routes/            Express routers — thin, validate + respond
 │    data.js          tasks/projects/goals/journal/gratitude/calendar/checkins
 │    study-work.js    courses/topics/exams/shifts/work-notes
 │    safe.js          safe-living plans, sessions, situation analysis, day status
 │    ai.js            providers, models, assistants, conversations, chat, memory, knowledge, AI helpers
 │    audio.js         audio files, presets, sound scenes, focus sessions
 │    system.js        health, settings, backups, insights, events, dashboard/today, export
 │
 ├─ services/          business logic
 │    chat.js          conversation + message persistence, provider resolution, turn orchestration
 │    prompt-engine.js modular system prompt: base + persona + preferences + live context + RAG
 │    context-builder.js builds a token-budgeted context, honoring assistant permissions
 │    memory.js        CRUD + hybrid FTS5/LIKE retrieval
 │    knowledge.js     bases, documents, chunking, FTS5 RAG with citations
 │    settings.js      namespaced key/value settings
 │    backup.js        SQLite serialize/deserialize + managed folder copies
 │    insights.js      careful, correlational statistics
 │
 ├─ providers/         AIProvider interface + adapters
 │    base.js          shared contract (testConnection/listModels/generate/stream/embeddings)
 │    ollama.js        /api/tags, /api/chat, /api/embed
 │    openai-compatible.js /v1/models, /v1/chat/completions, /v1/embeddings
 │    mock.js          deterministic fake provider for tests
 │
 ├─ db/                node:sqlite connection, idempotent schema, seeding, FTS rebuild
 │
 └─ lib/               utilities (tokens, FTS query sanitizer, fetch helper)
```

## AI request pipeline

For every chat turn:

1. Resolve the conversation + assistant (persona).
2. `resolveModel()` chooses provider + model: conversation/assistant model → settings default
   → primary provider's first cached model.
3. `buildContext()` reads **only** what the assistant's permissions allow:
   profile, memories, today's tasks, today's schedule, active safe-living plan, RAG chunks
   (restricted to the assistant's knowledge bases).
4. `buildPrompt()` assembles a modular system prompt and applies token budgets
   (system / profile / conversation / memories+RAG / user message / generation).
5. `generate()` or `stream()` on the provider; the result is persisted as messages with
   `metadata.contextUsed` (powers the "Why did the AI know this?" inspector).
6. On provider failure, the turn returns a calm fallback message — the app keeps working.

## Security model

- AI output is **never executed**. It is rendered as sanitized markdown.
- RAG content is placed in the prompt as **data**, clearly separated from system instructions
  (mitigates prompt-injection from imported documents).
- Destructive operations (delete memories, restore backups, etc.) require explicit user
  confirmation in the UI.
- The single LLM-facing boundary is the provider layer; every request goes through token
  budgets so a local model's context window can never be blown up.
