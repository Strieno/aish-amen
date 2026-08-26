import { AIProvider } from './base.js';
import { fetchWithTimeout } from '../lib/net.js';

/**
 * Ollama provider — talks directly to a local Ollama server.
 *   /api/tags         -> list models
 *   /api/chat         -> non-streaming and streaming chat
 *   /api/embed        -> embeddings
 */
export class OllamaProvider extends AIProvider {
  normalizeOptions(opts = {}) {
    const o = {};
    if (opts.temperature !== undefined) o.temperature = opts.temperature;
    if (opts.top_p !== undefined) o.top_p = opts.top_p;
    if (opts.top_k !== undefined) o.top_k = opts.top_k;
    if (opts.repeat_penalty !== undefined) o.repeat_penalty = opts.repeat_penalty;
    if (opts.seed !== undefined) o.seed = opts.seed;
    if (opts.max_tokens !== undefined) o.num_predict = opts.max_tokens;
    if (opts.context_size !== undefined) o.num_ctx = opts.context_size;
    if (opts.stop !== undefined && Array.isArray(opts.stop)) o.stop = opts.stop;
    return o;
  }

  async testConnection() {
    const start = Date.now();
    const data = await this.getJson(`${this.baseUrl}/api/tags`);
    const models = Array.isArray(data.models) ? data.models.length : 0;
    return {
      ok: true,
      message: `${this.name} متصل — ${models} نموذج متاح`,
      models,
      latencyMs: Date.now() - start,
    };
  }

  async listModels() {
    const data = await this.getJson(`${this.baseUrl}/api/tags`);
    return (data.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      contextLimit: m.details?.context_length || m.context_length || null,
      capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
      parameterSize: m.details?.parameter_size || null,
      sizeBytes: m.size || null,
      modifiedAt: m.modified_at || null,
    }));
  }

  async generate({ model, messages, options = {} }) {
    const start = Date.now();
    const data = await this.getJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        // Keep everyday app interactions responsive. Callers can opt into
        // extended reasoning explicitly with `think: true`.
        think: options.think ?? false,
        options: this.normalizeOptions(options),
      }),
    });
    if (data.error) throw new Error(`${this.name}: ${data.error}`);
    const content = (data.message?.content ?? data.message?.thinking ?? '').trim();
    if (!content) throw new Error(`${this.name}: response empty`);
    return {
      content,
      model: data.model || model,
      provider: this.id,
      tokensIn: data.prompt_eval_count ?? null,
      tokensOut: data.eval_count ?? null,
      generationMs: Date.now() - start,
    };
  }

  async *stream({ model, messages, options = {}, signal }) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const res = await fetchWithTimeout(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          think: options.think ?? false,
          options: this.normalizeOptions(options),
        }),
        signal: ctrl.signal,
      },
      this.timeoutMs,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.name}: ${res.status} ${body.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let meta = {};
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let chunk;
          try {
            chunk = JSON.parse(t);
          } catch {
            continue;
          }
          if (chunk.done) {
            meta = chunk;
            continue;
          }
          const text = chunk.message?.content ?? chunk.message?.thinking ?? '';
          if (text) yield text;
        }
      }
      if (buf.trim()) {
        try {
          const chunk = JSON.parse(buf.trim());
          if (chunk.done) meta = chunk;
        } catch {
          /* ignore */
        }
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
      reader.cancel().catch(() => {});
    }
    return {
      model: meta.model || model,
      provider: this.id,
      tokensIn: meta.prompt_eval_count ?? null,
      tokensOut: meta.eval_count ?? null,
    };
  }

  async embeddings(texts) {
    const list = Array.isArray(texts) ? texts : [texts];
    const out = [];
    for (const text of list) {
      const data = await this.getJson(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ model: this.embeddingModel, input: text }),
      });
      const vec = data.embeddings?.[0];
      if (!vec) throw new Error(`${this.name}: embedding response empty`);
      out.push(vec);
    }
    return out;
  }
}
