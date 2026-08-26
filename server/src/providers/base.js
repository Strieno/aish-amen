import { fetchWithTimeout, readJson } from '../lib/net.js';

/**
 * Base AI provider contract. Subclasses implement:
 *   testConnection(), listModels(), generate(), stream(), embeddings()
 *
 * Every method must fail loudly (throw) so the orchestration layer can
 * fall back or surface a human-friendly error.
 */
export class AIProvider {
  constructor(config = {}) {
    this.id = config.id;
    this.type = config.type;
    this.name = config.name;
    this.baseUrl = (config.base_url || '').replace(/\/+$/, '');
    this.apiKey = config.api_key || '';
    this.headers = config.headers || {};
    this.timeoutMs = config.timeout_ms || 120000;
    this.embeddingModel = config.embedding_model || null;
  }

  buildHeaders(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...this.headers, ...extra };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async getJson(url, opts) {
    const res = await fetchWithTimeout(url, opts, this.timeoutMs);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.name}: ${res.status} ${body.slice(0, 300)}`);
    }
    return readJson(res);
  }

  async testConnection() {
    throw new Error('not implemented');
  }

  async listModels() {
    return [];
  }

  async generate() {
    throw new Error('not implemented');
  }

  async *stream() {
    throw new Error('not implemented');
  }

  async embeddings() {
    throw new Error('embeddings not supported');
  }

  /** @returns true if this provider can be used to embed text */
  get supportsEmbeddings() {
    return typeof this.embeddings === 'function' && this.embeddingModel;
  }
}
