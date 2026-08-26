# AI Providers

All inference flows through a small adapter interface (`server/src/providers/base.js`):

```js
testConnection() -> { ok, message, latencyMs }
listModels() -> [{ id, name, contextLimit, capabilities }]
generate({ model, messages, options }) -> { content, model, provider, tokensIn, tokensOut, generationMs }
stream({ model, messages, options, signal })  // async generator of text chunks
embeddings?(texts) -> number[][]
```

## Ollama

- Default URL `http://localhost:11434`.
- Discovery: `GET /api/tags`; chat: `POST /api/chat` (stream + non-stream);
  embeddings: `POST /api/embed` (uses the provider's `embedding_model`).
- Streaming handles `message.content` and falls back to `message.thinking` for
  "thinking" models that emit reasoning deltas.

## OpenAI-compatible (LM Studio, llama.cpp, vLLM, custom)

- Default URL `http://localhost:1234/v1` (LM Studio), any `/v1` base works.
- Uses `/models`, `/chat/completions` (SSE streaming), and `/embeddings`.
- Supports API key + custom headers.

## Mock

- Deterministic, always-on provider for automated tests and offline demos.
- Clearly labelled in the UI; never used silently for real data.

## Selecting providers & models

- `ai_providers.is_primary` marks the default provider.
- `settings.ai.defaultModel` is the fallback default model.
- Per-conversation and per-assistant `provider_id`/`model` override the default.
- `POST /api/providers/:id/test` tests a connection and caches discovered models into
  `ai_models` (shown in the model dropdowns).

## Privacy

- API keys are stored in the local SQLite DB only; they are never sent to the frontend
  (`/api/providers` masks them with `has_api_key`).
- Maximum Privacy Mode is a UI/flag today; cloud providers are never required.
- No telemetry leaves the machine.
