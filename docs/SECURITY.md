# Security

## Principles

- **Local-first.** The default configuration touches no external service. The app is fully
  usable offline. AI providers are optional and always local-first (Ollama / OpenAI-compatible
  on localhost) unless the user explicitly adds a remote endpoint.
- **AI output is never code.** LLM responses are rendered as sanitized markdown
  (`react-markdown` with GFM; no raw HTML). The backend never executes strings produced by a
  model, and paths from user input are always confined to managed directories.
- **Prompt-injection defense.** Imported documents go into the prompt as **retrieved content**,
  clearly separated from system/user instructions. A document can never change the app's
  behavior or policy.
- **User confirmation on destructive actions.** Deleting memories, clearing data, restoring
  backups, and bulk deletions all require explicit confirmation. Export/import is best-effort
  and never overwrites schemas.

## Secrets

- API keys are stored only in the local SQLite DB (`ai_providers.api_key`).
- The REST layer never returns stored keys — `/api/providers` exposes `has_api_key` only.
- The frontend bundle contains no secrets.
- (Future) a real OS credential manager / encrypted store can back `api_key` without API changes.

## Data access boundaries

- Every assistant declares `memory_permissions` and `tool_permissions`.
- The **context builder enforces these in backend logic**, not just in the UI:
  the Work assistant cannot read journal entries; the Study assistant cannot read work notes,
  etc. AI never receives data it isn't permitted to read.
- The "Why did the AI know this?" inspector shows the exact context used per reply.

## Transport / files

- In production the app is served from `http://localhost` — bind to a non-loopback interface
  only if you explicitly want LAN access.
- File uploads (audio, documents) are copied into managed directories under `server/data/`;
  stored names are generated server-side, so path traversal is not possible.
- Database handles WAL + SHM correctly on backup/restore (clean snapshot, no partial reads).

## Operational

- Event log (`app_events`) never stores secrets or raw private content.
- Quiet hours and notification policies keep the app non-intrusive; no audio is auto-played
  on first launch, and imported audio defaults to a moderate volume.
