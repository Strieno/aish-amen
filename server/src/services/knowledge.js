import { all, get, run, transaction } from '../db/index.js';
import { uid, nowIso, sha256Hex, parseJson, ftsQuery } from '../lib/util.js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DOCS_DIR } from '../db/index.js';
import { rebuildFts } from '../db/index.js';

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

export function listKnowledgeBases() {
  return all('SELECT * FROM knowledge_bases ORDER BY name');
}

export function getKnowledgeBase(id) {
  return get('SELECT * FROM knowledge_bases WHERE id = ?', id);
}

export function createKnowledgeBase({ name, description = '' }) {
  const id = uid('kb-');
  run('INSERT INTO knowledge_bases(id, name, description) VALUES (?,?,?)', id, name, description);
  return getKnowledgeBase(id);
}

export function deleteKnowledgeBase(id) {
  transaction(() => {
    const docs = all('SELECT id FROM documents WHERE kb_id = ?', id);
    for (const d of docs) {
      try {
        const row = get('SELECT path FROM documents WHERE id = ?', d.id);
        if (row && row.path && existsSync(row.path)) {
          // ignore missing files
        }
      } catch { /* ignore */ }
    }
    run('DELETE FROM documents WHERE kb_id = ?', id);
    run('DELETE FROM knowledge_bases WHERE id = ?', id);
  });
  rebuildFts();
}

export function listDocuments(kbId) {
  return all(
    `SELECT d.*, (SELECT COUNT(*) FROM document_chunks c WHERE c.document_id = d.id) AS chunks
     FROM documents d WHERE d.kb_id = ? ORDER BY d.created_at DESC`,
    kbId,
  );
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const chunks = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let i = 0; i < clean.length; i += step) {
    chunks.push(clean.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Import a text document into a knowledge base. Saves the file to managed
 * storage, splits it into chunks, and indexes into FTS5.
 */
export async function importDocument({ kbId, filename, content, status = 'ready' }) {
  const kb = getKnowledgeBase(kbId);
  if (!kb) throw new Error('Knowledge base not found');

  const safeName = filename.replace(/[^\w.\-\u0600-\u06FF ]+/g, '_').slice(-120);
  const hash = await sha256Hex(content);
  const existing = get('SELECT * FROM documents WHERE hash = ?', hash);
  if (existing) {
    return { duplicate: true, document: existing };
  }

  const id = uid('doc-');
  const destDir = path.join(DOCS_DIR, kbId);
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${id}-${safeName}`);
  writeFileSync(dest, content, 'utf8');

  const chunks = chunkText(content);
  run(
    'INSERT INTO documents(id, kb_id, filename, path, hash, status, page_count) VALUES (?,?,?,?,?,?,?)',
    id,
    kbId,
    filename,
    dest,
    hash,
    status,
    chunks.length,
  );
  transaction(() => {
    chunks.forEach((text, idx) => {
      const cid = uid('chunk-');
      run(
        'INSERT INTO document_chunks(id, document_id, content, chunk_index, tokens) VALUES (?,?,?,?,?)',
        cid,
        id,
        text,
        idx,
        Math.ceil(text.length / 4),
      );
    });
  });
  rebuildFts();
  return { duplicate: false, document: get('SELECT * FROM documents WHERE id = ?', id) };
}

export function deleteDocument(id) {
  run('DELETE FROM documents WHERE id = ?', id);
  rebuildFts();
}

export function listDocumentChunks(documentId, { limit = 50 } = {}) {
  return all(
    'SELECT * FROM document_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT ?',
    documentId,
    limit,
  );
}

/**
 * RAG retrieval over indexed documents. Returns chunks with citations.
 */
export function searchKnowledge(query, { kbIds = [], limit = 6 } = {}) {
  const match = ftsQuery(query);
  const rows = match
    ? all(
        `SELECT c.id AS chunk_id, c.content, c.chunk_index, c.document_id,
                d.filename, d.kb_id,
                bm25(document_fts) AS score
         FROM document_fts
         JOIN document_chunks c ON c.id = document_fts.chunk_id
         JOIN documents d ON d.id = c.document_id
         WHERE document_fts MATCH ?
         ORDER BY score ASC
         LIMIT ?`,
        match,
        limit,
      )
    : [];
  let results = rows;

  // LIKE fallback for Arabic affixes / partial words.
  const tokens = String(query).split(/\s+/).filter((t) => t.length > 2).slice(0, 4);
  if (tokens.length) {
    const likeRows = all(
      `SELECT c.id AS chunk_id, c.content, c.chunk_index, c.document_id,
              d.filename, d.kb_id, 0 AS score
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE (${tokens.map(() => 'c.content LIKE ?').join(' OR ')})
       ORDER BY c.created_at DESC
       LIMIT ?`,
      ...tokens.map((t) => `%${t}%`),
      limit,
    );
    const seen = new Set(results.map((r) => r.chunk_id));
    for (const r of likeRows) {
      if (!seen.has(r.chunk_id)) {
        seen.add(r.chunk_id);
        results.push(r);
      }
    }
  }

  const filtered = kbIds.length ? results.filter((r) => kbIds.includes(r.kb_id)) : results;
  return filtered.slice(0, limit).map((r) => ({
    chunk_id: r.chunk_id,
    content: r.content,
    document_id: r.document_id,
    filename: r.filename,
    kb_id: r.kb_id,
    page: Math.floor(r.chunk_index / 5) + 1,
  }));
}
