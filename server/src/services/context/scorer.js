/**
 * ACE scoring — weighted relevance for every candidate.
 *
 *   score = 0.40 semantic + 0.20 recency + 0.20 importance
 *         + 0.10 persistence + 0.10 user impact
 *
 * A pluggable RelevanceProvider interface lets embeddings be added later
 * without touching the rest of the pipeline.
 */

const DAY = 86400000;

/** Pluggable semantic relevance. Keyword overlap now; embeddings later. */
export class KeywordRelevanceProvider {
  constructor() {
    this.cache = new Map();
  }

  tokens(text) {
    return new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  }

  /** 0..1 normalized overlap between the query and a text. */
  score(query, text) {
    const key = `${query}||${text}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const q = this.tokens(query);
    if (!q.size || !text) return 0;
    const lower = String(text).toLowerCase();
    let hits = 0;
    for (const t of q) {
      if (lower.includes(t)) hits += 1;
    }
    const score = Math.min(1, hits / Math.min(q.size, 4));
    if (this.cache.size > 400) this.cache.clear();
    this.cache.set(key, score);
    return score;
  }
}

/** 0..1 — old-but-persistent data stays relevant; fresh data ranks high. */
export function recencyScore(iso, { persistent = false, now = new Date() } = {}) {
  if (!iso) return persistent ? 0.5 : 0.05;
  const days = (now.getTime() - new Date(iso).getTime()) / DAY;
  if (days < 0) return 1;
  if (days < 1) return 1;
  if (days < 7) return 0.6;
  if (days < 30) return 0.3;
  const decay = Math.max(0.05, 0.3 - (days - 30) / 400);
  return persistent ? Math.max(0.6, decay) : decay;
}

function isPersistent(source, meta = {}) {
  if (source === 'goal' && meta.status === 'active') return true;
  if (source === 'task') return true;
  if (source === 'safe_living') return true;
  if (meta.pinned) return true;
  return false;
}

function importanceValue(source, meta = {}, fallback = 0.5) {
  if (meta.importance != null) return Number(meta.importance);
  if (source === 'task') return meta.priority === 'high' ? 0.9 : meta.priority === 'medium' ? 0.6 : 0.3;
  if (source === 'checkin') return 0.5;
  if (source === 'goal') return 0.8;
  return fallback;
}

function impactValue(source, meta = {}, now = new Date()) {
  if (source === 'task') {
    if (meta.due_date) {
      const due = new Date(`${meta.due_date}T23:59:59`);
      const days = (due.getTime() - now.getTime()) / DAY;
      if (days >= 0 && days <= 3) return 1;
      if (days >= 0 && days <= 7) return 0.8;
    }
    return meta.priority === 'high' ? 0.7 : 0.3;
  }
  if (source === 'study' && meta.exam_date) {
    const days = (new Date(meta.exam_date).getTime() - now.getTime()) / DAY;
    if (days >= 0 && days <= 14) return 1;
  }
  if (source === 'checkin' && (Number(meta.stress) >= 7 || /قلق/i.test(meta.concern || ''))) return 0.9;
  if (source === 'safe_living' && meta.active) return 1;
  return 0.3;
}

/**
 * @param {import('../context/types.js').ContextItem} item
 * @returns {number} composite score 0..1
 */
export function scoreItem({ item, query = '', provider, now = new Date() }) {
  const semantic = provider.score(query, item.text) * 0.4;
  const persistent = isPersistent(item.source, item.metadata || {});
  const recency = recencyScore(item.createdAt, { persistent, now }) * 0.2;
  const importance = importanceValue(item.source, item.metadata || {}, item.importance) * 0.2;
  const persistence = (persistent ? 1 : 0.3) * 0.1;
  const impact = impactValue(item.source, item.metadata || {}, now) * 0.1;
  return Number((semantic + recency + importance + persistence + impact).toFixed(3));
}

/** @returns sorted [{ item, score }] */
export function scoreItems({ items, query = '', now = new Date(), provider = new KeywordRelevanceProvider() }) {
  return items
    .map((item) => ({ item, score: scoreItem({ item, query, provider, now }) }))
    .sort((a, b) => b.score - a.score);
}
