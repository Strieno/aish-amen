import { AIProvider } from './base.js';
import { fetchWithTimeout } from '../lib/net.js';

/**
 * OpenAI-compatible provider — works with LM Studio, llama.cpp servers,
 * vLLM, cloud endpoints exposing /v1/chat/completions, and more.
 */
export class OpenAICompatibleProvider extends AIProvider {
  normalizeOptions(opts = {}, model = '') {
    const o = {};
    const modernReasoningModel = /^(?:gpt-5(?:[.\-]|$)|o[134](?:[.\-]|$))/i.test(model);
    // Newer GPT and o-series models reject legacy sampling controls and use
    // max_completion_tokens instead of max_tokens.
    if (!modernReasoningModel && opts.temperature != null) o.temperature = opts.temperature;
    if (!modernReasoningModel && opts.top_p != null) o.top_p = opts.top_p;
    if (opts.max_tokens != null) {
      if (modernReasoningModel) o.max_completion_tokens = opts.max_tokens;
      else o.max_tokens = opts.max_tokens;
    }
    if (opts.stop !== undefined && Array.isArray(opts.stop)) o.stop = opts.stop;
    if (opts.seed !== undefined) o.seed = opts.seed;
    return o;
  }

  async testConnection() {
    const start = Date.now();
    const data = await this.getJson(`${this.baseUrl}/models`, { headers: this.buildHeaders() });
    const models = Array.isArray(data.data) ? data.data.length : 0;
    return {
      ok: true,
      message: `${this.name} متصل — ${models} نموذج متاح`,
      models,
      latencyMs: Date.now() - start,
    };
  }

  async listModels() {
    const data = await this.getJson(`${this.baseUrl}/models`, { headers: this.buildHeaders() });
    return (data.data || []).map((m) => ({
      id: m.id,
      name: m.id,
      contextLimit: m.context_window ?? m.max_context_length ?? null,
      capabilities: ['completion'],
    }));
  }

  async generate({ model, messages, options = {} }) {
    const start = Date.now();
    const data = await this.getJson(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...this.normalizeOptions(options, model),
      }),
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name}: response empty`);
    return {
      content,
      model: data.model || model,
      provider: this.id,
      tokensIn: data.usage?.prompt_tokens ?? null,
      tokensOut: data.usage?.completion_tokens ?? null,
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
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          ...this.normalizeOptions(options, model),
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
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop();
        for (const part of parts) {
          const t = part.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let chunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          const text = chunk.choices?.[0]?.delta?.content ?? '';
          if (text) yield text;
        }
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
      reader.cancel().catch(() => {});
    }
    return { model, provider: this.id, tokensIn: null, tokensOut: null };
  }

  async embeddings(texts) {
    const list = Array.isArray(texts) ? texts : [texts];
    const data = await this.getJson(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ model: this.embeddingModel, input: list }),
    });
    return (data.data || []).map((d) => d.embedding);
  }

  /** Text-to-speech via the OpenAI /audio/speech endpoint (returns mp3 Buffer). */
  async tts({ text, model = 'tts-1', voice = 'alloy', speed = 1 }) {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/audio/speech`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model,
          input: text,
          voice,
          speed,
          response_format: 'mp3',
        }),
      },
      this.timeoutMs,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.name}: ${res.status} ${body.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
