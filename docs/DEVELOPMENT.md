# Development

## Prerequisites

- **Node.js 22.5+** (uses `node:sqlite`, which is built in — no compilation).
- npm (bundled).
- Optional: [Ollama](https://ollama.com) for real local AI; LM Studio or any
  OpenAI-compatible server works too.

## Structure

```
aish-aman/
├── server/    Express + SQLite backend (port 4321)
│   ├── src/            db/ providers/ services/ routes/ lib/
│   ├── test/           node:test unit tests
│   └── scripts/        live integration + acceptance smoke tests
├── frontend/  React + Vite + TS + Tailwind (port 5173 dev)
│   └── src/            pages/ components/ lib/
├── docs/      architecture & reference docs
└── package.json        root scripts
```

## Commands

From the repo root:

```bash
npm run install:all        # install both workspaces
npm run dev:server         # backend, auto-restart
npm run dev:frontend       # Vite dev server (proxies /api → :4321)
npm run build              # frontend production build (typecheck + vite build)
npm start                  # backend only (serves frontend/dist at :4321)
npm run test:server        # backend unit tests
npm run typecheck          # frontend typecheck only
```

## Code style

- **Backend**: ES modules, small single-purpose files, `services/` for logic,
  `routes/` thin. Errors from async route handlers are caught globally via
  `express-async-errors`; the final handler returns `{ error }` JSON.
- **Frontend**: functional components, hooks in `lib/`, no giant components.
  Design tokens are CSS variables in `src/index.css` (themes live there).
  All strings go through `useT()` (i18n) — never hard-code Arabic/English in components.

## Testing

```bash
cd server && npm test          # 14 unit tests (isolated temp data dir)
node scripts/acceptance.mjs    # 17-step end-to-end workflow (needs server running)
```

The acceptance script covers: health, task CRUD, journal, Ollama connect + model discovery,
streaming chat, assistant creation, document import, RAG citations, memory store/retrieve,
audio import, sound scenes, focus sessions, backups, check-ins, insights, and export.

## Connecting Ollama

```bash
ollama serve
ollama pull command-r7b-arabic    # or qwen3, llama, gemma...
```

Then in the app: **Settings → AI → Test connection** on the Ollama row → choose a default model.

## Voice / speech

Read-aloud is implemented through OpenAI's Audio Speech endpoint and defaults to `tts-1`
with the `alloy` voice. Local mode uses a configured OpenAI-compatible provider; cloud mode
uses the authenticated Vercel route. Browser speech is available only as the selected fallback.
Speech-to-text uses the browser Speech Recognition API when supported.

## Adding a page

1. Add an i18n key in `frontend/src/lib/i18n.ts` (both `ar` and `en`).
2. Add a nav entry in `frontend/src/lib/nav.ts`.
3. Create `frontend/src/pages/XPage.tsx` and register the route in `src/main.tsx`.
4. Add any backend endpoint as a route under `server/src/routes/`.

## Production build

```bash
npm run build
npm start
# → http://localhost:4321
```
