# عِش آمن — Aish Aman OS

A private, **local-first with optional cloud sync**, bilingual (Arabic/English, RTL/LTR) personal AI operating system:
safe living, emotional stability, tasks, study, work, journaling, goals, gratitude, memory,
knowledge base (RAG), ambient audio, focus timer, and a local LLM chat interface.

By default everything runs locally. Ollama (or any OpenAI-compatible server) powers the AI;
your data lives in SQLite and local files. Add Supabase environment variables to enable
email/password accounts, per-user cloud data, realtime multi-device sync, offline queues,
and an installable PWA. The local version remains available with no account requirement.

---

## Quick Start

Requires **Node.js 22.5+**. No Python or Rust needed.

### Windows — one click

Double-click **`تشغيل-عش-آمن.cmd`**. The launcher installs missing dependencies on the
first run, rebuilds only when the frontend changed, starts the app in the background,
and opens `http://localhost:4321` automatically.

You can also run the same launcher from a terminal:

```bash
npm run app
```

### Development mode

```bash
cd aish-aman

# 1) Install dependencies (server + frontend)
npm run install:all

# 2) Start the backend (REST/SSE API on http://localhost:4321)
npm run dev:server

# 3) In a second terminal, start the frontend dev server (http://localhost:5173)
npm run dev:frontend
```

Open http://localhost:5173

### Optional cloud / multi-device mode

See [`docs/CLOUD_DEPLOYMENT.md`](docs/CLOUD_DEPLOYMENT.md). In short: run the included
Supabase SQL migration, copy `frontend/.env.example` to `.env.local`, set the project URL
and publishable key, then deploy with the included `vercel.json`. Existing SQLite data is
moved only after an explicit confirmation in Settings; it is never deleted automatically.

### Production / single-process

```bash
npm run build        # compiles the React frontend into frontend/dist
npm start            # backend serves the built app at http://localhost:4321
```

### Connect a local AI model

1. Install [Ollama](https://ollama.com) and start it (`ollama serve`).
2. `ollama pull command-r7b-arabic` (or any chat model).
3. Open the app → **الإعدادات / Settings → AI → Test connection → Models**.
4. Pick a default model. Chat now streams from your local model.

LM Studio, llama.cpp servers, and any `/v1/chat/completions` endpoint also work via
**Settings → Add AI connection → OpenAI-compatible**.

Without any AI server the app still fully works for tasks, journal, goals, study, work,
audio, focus, memory and knowledge — the AI chat simply shows a setup hint.

---

## Features

| Area | What works |
| --- | --- |
| **المساعد الذكي في كل صفحة** | Floating AI assistant (bottom corner) with streaming answers, page-aware context, quick suggestion chips, live model status — on every screen |
| **اليوم / Today** | Dashboard: status, today's tasks (critical/recommended/optional), schedule, AI suggestion, **AI day planner**, **AI next-task picker**, non-diagnostic load indicator |
| **المحادثة / Chat** | Streaming LLM chat, markdown + tables, personas/assistants, model switcher, **conversation folders + tags with AI auto-categorization**, **import (JSON/Markdown) & export**, search, pin/rename/delete, context inspector ("why did the AI know this?"), regenerate/edit/delete messages |
| **العيش الآمن / Safe Living** | **AI situation analysis** (calm framework: what is happening / knowns / unknowns / smallest safe action), reusable plans, activate/end plans, day-load indicator |
| **المهام / Tasks** | Quick add with **AI smart capture** ("اشتري قهوة غداً" → task with due date, "أشعر بالتعب" → journal), priorities, energy levels, projects, AI breakdown with approval, low-energy filter |
| **الدراسة / Study** | Courses, topics, exams, **AI study tutor** (explain / quiz me / flashcards / practice per course), per-course tasks |
| **العمل / Work** | Shifts and private work notes |
| **اليوميات / Journal** | Markdown journal with autosave, mood, tags, per-entry AI-read toggle, **AI calm summary & reflection** per entry |
| **الأهداف / Goals** | Life areas, goals, milestones with progress, **AI goal review** with one next step |
| **الامتنان / Gratitude** | Simple 3-item daily entries (no fake positivity) |
| **الذاكرة / Memory** | **Harvests memories from every field in the app** (tasks completed, check-ins, milestones, focus sessions, exam grades, safe-plan activations, journal, work notes) with source provenance, importance/pinning/AI-access, hybrid Arabic-aware search, **AI consolidation suggestions across all domains**, delete all |
| **المعرفة / Knowledge** | Knowledge bases, document import, chunking, FTS5 RAG with citations (the assistant uses it automatically) |
| **الأصوات / Audio** | Import sounds, playback mixer, loop/volume, save live mix as a Sound Scene |
| **التركيز / Focus** | 25/5, 50/10, 90/20 + custom pomodoro with optional ambient audio and session logging |
| **الإحصائيات / Insights** | Focus averages, task completion, productive hour, postponed tasks, **AI gentle narrative summary** (correlational, never causal) |
| **الإعدادات / Settings** | Language (AR/EN + RTL/LTR), 4 accent themes × light/dark/system, AI providers & test, default model, privacy mode, backups, export, event log |

## Architecture

```
aish-aman/
├── server/                 # Node.js (Express) backend — port 4321
│   ├── src/
│   │   ├── db/             # SQLite (node:sqlite), schema, migrations, seeding
│   │   ├── providers/      # AIProvider adapters: Ollama, OpenAI-compatible, Mock
│   │   ├── services/       # LifeContextEngine, chat orchestration, prompt engine,
│   │   │                   # AI proposals/executor, entity links, activity events,
│   │   │                   # memory, knowledge/RAG, graph, smart-context, timeline,
│   │   │                   # backups, insights, settings
│   │   ├── routes/         # REST + SSE endpoints
│   │   └── index.js        # entry point
│   ├── test/               # node:test unit tests
│   └── scripts/            # live integration/acceptance smoke tests
├── frontend/               # React + Vite + TypeScript + Tailwind (port 5173 in dev)
│   └── src/
│       ├── pages/          # one page per module + Graph (شبكة حياتي) + Timeline (خط حياتي)
│       ├── components/     # UI, layout, markdown, EntityChip, RelatedPanel,
│       │                   # SmartContextPanel, AIActionCards, AiAssistantPanel
│       └── lib/            # api client, i18n, stores, audio player, entity utils
└── docs/                   # ARCHITECTURE, DATABASE, AI_PROVIDERS, AUDIO_SYSTEM, SECURITY, DEVELOPMENT
```

### LifeOS core (Personal Life Operating System)

- **LifeContextEngine** (`services/life-context.js`): before every AI reply, dynamically
  retrieves the most relevant context from *all* domains (memories, tasks, journal,
  check-ins, goals, courses, exams, focus, work, safe plans, conversations, activity)
  and ranks it by semantic relevance, recency, importance, and per-mode domain weights
  (general/university/work/safe/reflection/planning).
- **entity_links + activity_events**: every module is connected. Rule-based relationship
  discovery auto-links entities (high confidence) or suggests links (medium confidence).
  All events flow through an in-process domain event bus (memory harvest, activity index,
  link discovery) with zero extra infrastructure.
- **AI actions (chat → app)**: the assistant proposes structured actions (create task,
  start focus, save memory, create exam/goal/journal, activate plan) as interactive cards
  with approve/edit/dismiss; execution enforces user-configurable write permissions.
- **Universal search** (Ctrl+K): queries every module, grouped results.
- **شبكة حياتي (Life Graph)**: interactive force-directed graph (d3-force) with zoom/pan,
  type filters, search, focus mode, and click-through navigation.
- **خط حياتي (Timeline)**: unified cross-domain activity feed with domain filters,
  day/week/month grouping, and AI period synthesis.
- **السياق الذكي (Smart Context)**: page-adaptive drawer showing related entities,
  memories, tasks, deadlines, conversations, activity and link suggestions.
- **Related panels** ("مرتبط بـ") with provenance ("why?") on courses, goals, journal.
- **Context chips + modes** in chat: pin entities to a conversation, see exactly which
  records influenced each reply, and attach context manually.

- **Local-first by default.** SQLite database + managed file folders under `server/data/`.
- **AI is a subsystem, not the app.** If the model is unreachable every other feature still works.
- **Privacy.** No telemetry. API keys go into your local DB (never the frontend bundle).
  Maximum-privacy mode blocks cloud usage and shows `🔒 محلي فقط`.
- **User control.** AI reads only what the active assistant is permitted to read
  (per-assistant memory/tool permissions), and the "context inspector" shows exactly
  which context was used in a reply.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run install:all` | install server + frontend deps |
| `npm run dev:server` | run backend with auto-restart |
| `npm run dev:frontend` | run Vite dev server (proxies `/api`) |
| `npm run build` | typecheck + production build of frontend |
| `npm start` | run backend (serves built frontend) |
| `npm run test:server` | run backend unit tests |
| `node server/scripts/acceptance.mjs` | full end-to-end acceptance workflow (needs running server) |

## Data & Backups

- Database: `server/data/aish-aman.db`
- Documents / audio / attachments: `server/data/{documents,audio,attachments}/`
- Backups: **Settings → Backups → Create backup now** (serialized SQLite + managed folders).
- Export: **Settings → Data → Export** (full JSON).

## Tests

```bash
cd server && npm test          # 14 unit tests
node scripts/acceptance.mjs    # 17-step live acceptance workflow
```

## Documentation

See `docs/` for architecture, database schema, AI provider setup (Ollama / LM Studio /
custom), audio system design, security notes, and the development guide.

## License

MIT — your data is yours.
