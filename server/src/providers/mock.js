import { AIProvider } from './base.js';

/**
 * Mock provider — used for automated tests and for demonstrating the full
 * chat pipeline without a real model running. Clearly labelled, never used
 * for real production data silently.
 */
export class MockProvider extends AIProvider {
  constructor(config = {}) {
    super({ ...config, name: config.name || 'Mock' });
    this.reply =
      config.mockReply ||
      'هذه استجابة تجريبية من مزود Mock المحلي. قم بتوصيل Ollama أو خادم OpenAI-compatible لاستخدام نموذج حقيقي.';
  }

  async testConnection() {
    return { ok: true, message: 'Mock provider جاهز دائمًا', models: 2, latencyMs: 0 };
  }

  async listModels() {
    return [
      { id: 'mock-chat', name: 'mock-chat', contextLimit: 4096, capabilities: ['completion'] },
      { id: 'mock-embedding', name: 'mock-embedding', contextLimit: 2048, capabilities: ['embeddings'] },
    ];
  }

  async generate() {
    await new Promise((r) => setTimeout(r, 30));
    return { content: this.reply, model: 'mock-chat', provider: this.id, tokensIn: 1, tokensOut: 1, generationMs: 30 };
  }

  async *stream() {
    await new Promise((r) => setTimeout(r, 10));
    for (const word of this.reply.split(' ')) {
      await new Promise((r) => setTimeout(r, 15));
      yield word + ' ';
    }
  }

  async embeddings(texts) {
    const list = Array.isArray(texts) ? texts : [texts];
    // Deterministic pseudo-embedding so search logic can be exercised.
    return list.map((t) => {
      const vec = new Array(64).fill(0);
      for (let i = 0; i < t.length; i += 1) vec[i % 64] += (t.charCodeAt(i) % 16) / 16;
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map((v) => v / norm);
    });
  }
}
