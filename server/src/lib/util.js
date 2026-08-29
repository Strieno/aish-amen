export function uid(prefix = '') {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

export function nowIso() {
  return new Date().toISOString();
}

// Local calendar date: 0 = today. Avoid toISOString(), which converts to UTC
// and can move "today" to the previous/next day around local midnight.
export function dateKey(offsetDays = 0, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Very rough token estimate used for budget trimming (approx chars/4).
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(text, budget) {
  if (estimateTokens(text) <= budget) return text;
  return text.slice(0, budget * 4);
}

// Keep only the tail of an array of {content} messages within a token budget.
export function trimMessages(messages, budget) {
  const out = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const t = estimateTokens(m.content || '');
    if (used + t > budget) {
      if (out.length === 0) out.unshift({ ...m, content: truncateToTokens(m.content, budget) });
      break;
    }
    used += t;
    out.unshift(m);
  }
  return out;
}

export function sha256Hex(str) {
  // Inline async via SubtleCrypto; not available in older Node but Node 22+ has it.
  return globalThis.crypto?.subtle
    ? (async () => {
        const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      })()
    : Promise.resolve('sha-fallback');
}

/**
 * Converts arbitrary user text into a safe FTS5 MATCH expression.
 * Strips FTS special syntax, keeps word tokens, joins as quoted phrases.
 * Returns null when there is nothing safe to search for.
 */
export function ftsQuery(input, maxTokens = 8) {
  const tokens = String(input || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, maxTokens);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"`).join(' AND ');
}
