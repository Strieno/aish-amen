import { all, get } from '../db/index.js';
import { OllamaProvider } from './ollama.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { MockProvider } from './mock.js';
import { parseJson } from '../lib/util.js';

export function createProviderFromRow(row) {
  if (!row) return null;
  const cfg = { ...row, headers: parseJson(row.headers, {}) };
  switch (row.type) {
    case 'ollama':
      return new OllamaProvider(cfg);
    case 'openai-compatible':
      return new OpenAICompatibleProvider(cfg);
    case 'mock':
      return new MockProvider(cfg);
    default:
      return null;
  }
}

export function getProvider(id) {
  return createProviderFromRow(get('SELECT * FROM ai_providers WHERE id = ?', id));
}

export function listProviders() {
  return all('SELECT * FROM ai_providers ORDER BY is_primary DESC, name ASC').map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    base_url: r.base_url,
    embedding_model: r.embedding_model,
    timeout_ms: r.timeout_ms,
    is_primary: r.is_primary,
    has_api_key: !!(r.api_key && r.api_key.length > 0),
  }));
}

export function getPrimaryProvider() {
  const row = get('SELECT * FROM ai_providers WHERE is_primary = 1 LIMIT 1');
  if (row) return createProviderFromRow(row);
  const anyRow = get('SELECT * FROM ai_providers WHERE type != ? LIMIT 1', 'mock');
  return anyRow ? createProviderFromRow(anyRow) : null;
}

export async function discoverModelsForProvider(provider) {
  try {
    const models = await provider.listModels();
    return models;
  } catch (e) {
    return { error: e.message };
  }
}
