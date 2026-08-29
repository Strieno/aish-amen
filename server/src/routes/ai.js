import { Router } from 'express';
import { all, get, run, rebuildFts } from '../db/index.js';
import { uid, nowIso, dateKey } from '../lib/util.js';
import { getSetting, setSetting } from '../services/settings.js';
import {
  getProvider,
  listProviders,
  getPrimaryProvider,
  createProviderFromRow,
} from '../providers/index.js';
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  getMessage,
  saveMessage,
  deleteMessage,
  runChatTurn,
  persistTurn,
  cacheModels,
  resolveModel,
  maybeExtractMemory,
  runAssistTurn,
  oneShot,
  NO_MODEL_MESSAGE,
} from '../services/chat.js';
import { ACTIONS } from '../services/ai-actions.js';
import * as memoryService from '../services/memory.js';
import * as knowledgeService from '../services/knowledge.js';
import { buildContext } from '../services/context-builder.js';
import { proposeActions, executeProposal, proposalContextText } from '../services/ai-proposals.js';
import { universalSearch } from '../services/search.js';
import { getTimeline, backfillActivity } from '../services/activity.js';
import { graphQuery } from '../services/graph.js';
import {
  createLink,
  removeLink,
  relatedEntities,
  getEntityLinks,
  listLinkSuggestions,
  acceptSuggestion,
  rejectSuggestion,
  suggestLinksForEntity,
  recentLinks,
} from '../services/links.js';
import { smartContext } from '../services/smart-context.js';
import { getPinnedContext, setPinnedContext } from '../services/chat.js';
import { titleForEntity, CONTEXT_MODES, gatherContext, formatLifeContext } from '../services/life-context.js';
import { getRecentActivity } from '../services/activity.js';
import { synthesizeEdge, synthesizeOpenAI, openaiVoiceFor } from '../services/tts.js';
import { buildContextPacketHybrid, getAceStatus, buildDailyContext } from '../services/context/ace.js';
import { serializePacket, serializeDebug } from '../services/context/compressor.js';
import { fetchWithTimeout } from '../lib/net.js';

const r = Router();

function parseJson2(v, fb) {
  try {
    return typeof v === 'string' && v ? JSON.parse(v) : v ?? fb;
  } catch {
    return fb;
  }
}

/* ---------------- Providers ---------------- */

r.get('/providers', (_req, res) => res.json(listProviders()));

r.post('/providers', (req, res) => {
  const b = req.body || {};
  const id = uid('prov-');
  run(
    'INSERT INTO ai_providers(id, type, name, base_url, api_key, headers, embedding_model, timeout_ms, is_primary) VALUES (?,?,?,?,?,?,?,?,?)',
    id,
    b.type || 'openai-compatible',
    b.name || 'مزود جديد',
    b.base_url || null,
    b.api_key || null,
    JSON.stringify(b.headers || {}),
    b.embedding_model || null,
    b.timeout_ms ?? 120000,
    0,
  );
  res.status(201).json(listProviders().find((p) => p.id === id));
});

r.put('/providers/:id', (req, res) => {
  const row = get('SELECT * FROM ai_providers WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  run(
    'UPDATE ai_providers SET type=?, name=?, base_url=?, api_key=?, headers=?, embedding_model=?, timeout_ms=?, updated_at=? WHERE id=?',
    b.type ?? row.type,
    b.name ?? row.name,
    b.base_url ?? row.base_url,
    b.api_key !== undefined ? b.api_key : row.api_key,
    JSON.stringify(b.headers || parseJson2(row.headers, {})),
    b.embedding_model ?? row.embedding_model,
    b.timeout_ms ?? row.timeout_ms,
    nowIso(),
    req.params.id,
  );
  res.json(listProviders().find((p) => p.id === req.params.id));
});

r.delete('/providers/:id', (req, res) => {
  if (get('SELECT is_primary FROM ai_providers WHERE id = ?', req.params.id)?.is_primary) {
    // Promote another provider to keep a primary available.
    const other = get("SELECT id FROM ai_providers WHERE id != ? AND type != 'mock' LIMIT 1", req.params.id);
    if (other) run('UPDATE ai_providers SET is_primary = 1 WHERE id = ?', other.id);
  }
  run('DELETE FROM ai_providers WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

r.post('/providers/:id/test', async (req, res) => {
  const provider = getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: 'not found' });
  try {
    const result = await provider.testConnection();
    const models = await provider.listModels().catch(() => []);
    if (Array.isArray(models)) cacheModels(provider.id, models);
    res.json({ ok: true, ...result, models: Array.isArray(models) ? models : [] });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

r.post('/providers/:id/models', async (req, res) => {
  const provider = getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: 'not found' });
  try {
    const models = await provider.listModels();
    cacheModels(provider.id, models);
    res.json({ ok: true, models });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

r.post('/providers/primary', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  run('UPDATE ai_providers SET is_primary = 0');
  run('UPDATE ai_providers SET is_primary = 1 WHERE id = ?', id);
  res.json({ ok: true });
});

r.get('/models', (req, res) => {
  const { provider } = req.query;
  const rows = provider
    ? all('SELECT * FROM ai_models WHERE provider_id = ? ORDER BY display_name', provider)
    : all('SELECT * FROM ai_models ORDER BY provider_id, display_name');
  res.json(
    rows.map((m) => ({
      ...m,
      capabilities: parseJson2(m.capabilities, []),
    })),
  );
});

r.get('/ai/status', async (_req, res) => {
  const providers = listProviders();
  const out = [];
  for (const p of providers) {
    const provider = getProvider(p.id);
    let status = 'disconnected';
    let latencyMs = null;
    let modelCount = 0;
    try {
      const t = await provider.testConnection();
      status = t.ok ? 'connected' : 'error';
      latencyMs = t.latencyMs;
      modelCount = t.models || 0;
    } catch {
      status = 'error';
    }
    out.push({ id: p.id, type: p.type, name: p.name, base_url: p.base_url, status, latencyMs, modelCount, is_primary: !!p.is_primary });
  }
  res.json({ providers: out, defaultModel: getSetting('ai')?.defaultModel || null, maxPrivacy: getSetting('privacy')?.maxPrivacy || false });
});

/* ---------------- Assistants ---------------- */

r.get('/assistants', (_req, res) => {
  res.json(
    all('SELECT * FROM assistants ORDER BY is_default DESC, created_at').map((a) => ({
      ...a,
      memory_permissions: parseJson2(a.memory_permissions, {}),
      tool_permissions: parseJson2(a.tool_permissions, []),
      knowledge_base_ids: parseJson2(a.knowledge_base_ids, []),
      is_default: !!a.is_default,
    })),
  );
});
r.get('/assistants/:id', (req, res) => {
  const a = get('SELECT * FROM assistants WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json({
    ...a,
    memory_permissions: parseJson2(a.memory_permissions, {}),
    tool_permissions: parseJson2(a.tool_permissions, []),
    knowledge_base_ids: parseJson2(a.knowledge_base_ids, []),
    is_default: !!a.is_default,
  });
});
r.post('/assistants', (req, res) => {
  const b = req.body || {};
  const id = uid('asst-');
  run(
    'INSERT INTO assistants(id, name, slug, description, system_prompt, model, provider_id, temperature, context_limit, memory_permissions, tool_permissions, voice, response_style, knowledge_base_ids, is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    b.name || 'مساعد جديد',
    b.slug || `asst-${id.slice(-6)}`,
    b.description || '',
    b.system_prompt || null,
    b.model || null,
    b.provider_id || null,
    b.temperature ?? 0.6,
    b.context_limit ?? 8192,
    JSON.stringify(b.memory_permissions || {}),
    JSON.stringify(b.tool_permissions || []),
    b.voice || null,
    b.response_style || 'balanced',
    JSON.stringify(b.knowledge_base_ids || []),
    b.is_default ? 1 : 0,
  );
  res.status(201).json(get('SELECT * FROM assistants WHERE id = ?', id));
});
r.put('/assistants/:id', (req, res) => {
  const b = req.body || {};
  run(
    'UPDATE assistants SET name=?, description=?, system_prompt=?, model=?, provider_id=?, temperature=?, context_limit=?, memory_permissions=?, tool_permissions=?, voice=?, response_style=?, knowledge_base_ids=?, updated_at=? WHERE id=?',
    b.name,
    b.description || '',
    b.system_prompt || null,
    b.model || null,
    b.provider_id || null,
    b.temperature ?? 0.6,
    b.context_limit ?? 8192,
    JSON.stringify(b.memory_permissions || {}),
    JSON.stringify(b.tool_permissions || []),
    b.voice || null,
    b.response_style || 'balanced',
    JSON.stringify(b.knowledge_base_ids || []),
    nowIso(),
    req.params.id,
  );
  res.json(get('SELECT * FROM assistants WHERE id = ?', req.params.id));
});
r.delete('/assistants/:id', (req, res) => {
  run('DELETE FROM assistants WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Conversations ---------------- */

r.get('/conversations', (req, res) => res.json(listConversations({ q: req.query.q })));
r.post('/conversations', (req, res) => {
  const b = req.body || {};
  const conv = createConversation(b);
  res.status(201).json(conv);
});
r.get('/conversations/:id', (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});
r.put('/conversations/:id', (req, res) => {
  const c = updateConversation(req.params.id, req.body || {});
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});
r.delete('/conversations/:id', (req, res) => {
  deleteConversation(req.params.id);
  res.json({ ok: true });
});
r.get('/conversations/:id/messages', (req, res) => {
  res.json(getMessages(req.params.id));
});

/* ---------------- Conversation folders ---------------- */

r.get('/folders', (_req, res) => {
  res.json(
    all('SELECT * FROM conversation_folders ORDER BY name').map((f) => ({
      ...f,
      count: all('SELECT COUNT(*) AS n FROM conversations WHERE folder = ?', f.name)[0]?.n || 0,
    })),
  );
});
r.post('/folders', (req, res) => {
  const b = req.body || {};
  const name = (b.name || 'مجلد جديد').trim();
  const existing = get('SELECT * FROM conversation_folders WHERE name = ?', name);
  if (existing) return res.status(200).json(existing);
  const id = uid('folder-');
  run('INSERT INTO conversation_folders(id, name, color) VALUES (?,?,?)', id, name, b.color || null);
  res.status(201).json(get('SELECT * FROM conversation_folders WHERE id = ?', id));
});
r.put('/folders/:id', (req, res) => {
  const b = req.body || {};
  const existing = get('SELECT * FROM conversation_folders WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  run('UPDATE conversation_folders SET name=?, color=? WHERE id=?', b.name, b.color || null, req.params.id);
  if (b.name && b.name !== existing.name) {
    run('UPDATE conversations SET folder = ? WHERE folder = ?', b.name, existing.name);
  }
  res.json(get('SELECT * FROM conversation_folders WHERE id = ?', req.params.id));
});
r.delete('/folders/:id', (req, res) => {
  const existing = get('SELECT * FROM conversation_folders WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  run('UPDATE conversations SET folder = NULL WHERE folder = ?', existing.name);
  run('DELETE FROM conversation_folders WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ---------------- Conversation import / export / categorize ---------------- */

function parseMarkdownChat(text) {
  const lines = String(text || '').split('\n');
  let title = 'محادثة مستوردة';
  const messages = [];
  const roleRe = /^#{1,3}\s*(user|assistant|المستخدم|المساعد|أنا|أنت)\s*[:：]?\s*(.*)$/i;
  const boldRe = /^\*\*?\s*(user|assistant|المستخدم|المساعد)\s*\*{0,2}\s*[:：]?\s*(.*)$/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch && messages.length === 0) {
      title = titleMatch[1].trim();
      continue;
    }
    const m = line.match(roleRe) || line.match(boldRe);
    if (m && m[2]) {
      const role = /user|المستخدم|أنا/i.test(m[1]) ? 'user' : 'assistant';
      messages.push({ role, content: m[2].trim() });
    } else if (!line.startsWith('#')) {
      if (messages.length) messages[messages.length - 1].content += '\n' + line;
    }
  }
  return [{ title, messages }];
}

r.post('/conversations/import', (req, res) => {
  const b = req.body || {};
  let items = [];
  const raw = b.content != null ? b.content : b.data;
  if (b.format === 'markdown' || (typeof raw === 'string' && !raw.trim().startsWith('[') && !raw.trim().startsWith('{'))) {
    items = parseMarkdownChat(raw);
  } else {
    let data = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        return res.status(400).json({ error: 'invalid JSON' });
      }
    }
    if (data && data.type === 'conversation' && data.conversation && Array.isArray(data.messages)) {
      items = [{ title: data.conversation.title, folder: data.conversation.folder, tags: data.conversation.tags, messages: data.messages }];
    } else if (Array.isArray(data)) {
      items = data;
    } else if (data && Array.isArray(data.messages)) {
      items = [data];
    } else {
      return res.status(400).json({ error: 'unrecognized import format' });
    }
  }
  const created = [];
  for (const it of items) {
    if (!it || !Array.isArray(it.messages)) continue;
    const conv = createConversation({ title: it.title || 'محادثة مستوردة', assistantId: null, folder: it.folder || null, tags: it.tags || [] });
    for (const m of it.messages) {
      if (!m || !['user', 'assistant'].includes(m.role)) continue;
      run(
        'INSERT INTO messages(id, conversation_id, parent_message_id, role, content, created_at) VALUES (?,?,?,?,?,?)',
        uid('msg-'),
        conv.id,
        null,
        m.role,
        String(m.content || '').slice(0, 20000),
        m.created_at || nowIso(),
      );
    }
    created.push(conv.id);
  }
  res.status(201).json({ ok: true, imported: created.length, ids: created });
});

r.get('/conversations/:id/export', (req, res) => {
  const conv = getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const messages = getMessages(req.params.id).map((m) => ({
    role: m.role,
    content: m.content,
    model: m.model,
    created_at: m.created_at,
  }));
  res.json({ app: 'aish-aman', type: 'conversation', version: 1, conversation: conv, messages });
});

r.post('/conversations/:id/categorize', async (req, res) => {
  const conv = getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const msgs = getMessages(req.params.id)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 10)
    .map((m) => `${m.role}: ${m.content.slice(0, 220)}`)
    .join('\n');
  const folders = all('SELECT name FROM conversation_folders ORDER BY name').map((f) => f.name);
  const system = `اقترح تصنيفاً لهذه المحادثة. المجلدات المتاحة: ${folders.length ? folders.join('، ') : '(لا توجد بعد — يمكنك اقتراح اسم مجلد جديد قصير)'}.
أعد JSON فقط: {"folder":"اسم مجلد قصير أو null","tags":["وسم1","وسم2"]} بحد أقصى 3 وسوم عامة مفيدة.`;
  const r = await oneShot({ systemPrompt: system, userContent: msgs.slice(0, 4000), maxTokens: 220 });
  if (!r.ok) return res.json({ ok: false, error: r.error, fallback: true });
  const m = String(r.text).match(/\{[\s\S]*\}/);
  let json = null;
  if (m) {
    try {
      json = JSON.parse(m[0]);
    } catch { /* ignore */ }
  }
  if (!json) return res.json({ ok: true, suggested: { folder: null, tags: [] }, raw: r.text, fallback: false });
  const folder = typeof json.folder === 'string' && json.folder.trim() ? json.folder.trim().slice(0, 30) : null;
  const tags = Array.isArray(json.tags) ? json.tags.map((x) => String(x).slice(0, 20)).filter(Boolean).slice(0, 3) : [];
  res.json({ ok: true, suggested: { folder, tags }, model: r.model, fallback: false });
});
r.get('/messages/:id', (req, res) => {
  const m = getMessage(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  res.json({ ...m, metadata: parseJson2(m.metadata, {}) });
});
r.delete('/messages/:id', (req, res) => {
  deleteMessage(req.params.id);
  res.json({ ok: true });
});

/* ---------------- Chat ---------------- */

function sseHeaders(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
}
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function resolveAssistant(assistantId) {
  if (assistantId) {
    const a = get('SELECT * FROM assistants WHERE id = ?', assistantId);
    if (a) return a;
  }
  return get('SELECT * FROM assistants WHERE is_default = 1 LIMIT 1') || null;
}

r.post('/chat', async (req, res) => {
  const b = req.body || {};
  const content = String(b.content || '').trim();
  if (!content) return res.status(400).json({ error: 'content required' });

  let conversation = b.conversation_id ? getConversation(b.conversation_id) : null;
  if (!conversation) {
    conversation = createConversation({ title: content.slice(0, 40), assistantId: b.assistant_id, model: b.model, providerId: b.provider_id, mode: b.mode || 'general' });
  } else if (b.mode && b.mode !== conversation.mode) {
    updateConversation(conversation.id, { mode: b.mode });
    conversation = getConversation(conversation.id);
  }
  const assistant = resolveAssistant(b.assistant_id) || resolveAssistant(null);
  const result = await runChatTurn({
    conversation,
    assistant,
    userContent: content,
    model: b.model,
    provider: b.provider_id ? getProvider(b.provider_id) : null,
  });
  if (!result.fallback) {
    const resolvedProviderId = result.providerObj?.id || result.provider || null;
    if (conversation.model !== result.model || conversation.provider_id !== resolvedProviderId) {
      conversation = updateConversation(conversation.id, { model: result.model, providerId: resolvedProviderId });
    }
    persistTurn({ conversation, assistantId: assistant?.id, userContent: content, result, assistantContent: result.content });
    // Best-effort memory extraction from the exchange (never blocks the reply).
    maybeExtractMemory({ assistant, conversationId: conversation.id, userContent: content, result }).catch(() => {});
  }
  res.json({
    conversation_id: conversation.id,
    message: result.content,
    fallback: !!result.fallback,
    error: result.error || null,
    contextUsed: result.contextUsed || {},
    stats: result.stats || {},
    model: result.model,
    provider: result.provider,
  });
});

r.post('/chat/stream', async (req, res) => {
  const b = req.body || {};
  const content = String(b.content || '').trim();
  sseHeaders(res);
  if (!content) {
    sse(res, 'error', { message: 'المحتوى مطلوب' });
    return res.end();
  }

  let conversation = b.conversation_id ? getConversation(b.conversation_id) : null;
  if (!conversation) {
    conversation = createConversation({ title: content.slice(0, 40), assistantId: b.assistant_id, model: b.model, providerId: b.provider_id, mode: b.mode || 'general' });
  } else if (b.mode && b.mode !== conversation.mode) {
    updateConversation(conversation.id, { mode: b.mode });
    conversation = getConversation(conversation.id);
  }
  const assistant = resolveAssistant(b.assistant_id);

  const prep = await runChatTurn({
    conversation,
    assistant,
    userContent: content,
    model: b.model,
    provider: b.provider_id ? getProvider(b.provider_id) : null,
    stream: true,
  });

  if (!prep.provider || !prep.model) {
    sse(res, 'error', { message: 'لا يوجد نموذج مكوّن. أضف اتصال Ollama أو خادم OpenAI-compatible من الإعدادات.' });
    return res.end();
  }

  if (conversation.model !== prep.model || conversation.provider_id !== prep.provider.id) {
    conversation = updateConversation(conversation.id, { model: prep.model, providerId: prep.provider.id });
  }

  sse(res, 'start', { conversation_id: conversation.id, model: prep.model, provider: prep.provider.id });

  const userMsgId = uid('msg-');
  persistTurn({
    conversation,
    assistantId: assistant?.id,
    userContent: content,
    userMsgId,
    result: { model: prep.model, provider: prep.provider.id, fallback: false },
    assistantContent: '',
  });

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on('close', onClose);

  let full = '';
  let tokensOut = 0;
  let meta = null;
  const startedAt = Date.now();
  try {
    for await (const delta of prep.provider.stream({ model: prep.model, messages: prep.messages, options: prep.options, signal: controller.signal })) {
      full += delta;
      tokensOut += 1;
      sse(res, 'delta', { delta });
    }
  } catch (e) {
    if (full) {
      // Partial response — persist what we have.
      sse(res, 'done', { content: full, partial: true, error: null, model: prep.model, provider: prep.provider.id });
    } else {
      sse(res, 'error', { message: e.message });
    }
    persistAssistant(conversation.id, full || '', prep.model, prep.provider.id, prep.contextUsed, prep.stats, Date.now() - startedAt, !!meta);
    return res.end();
  }

  persistAssistant(conversation.id, full, prep.model, prep.provider.id, prep.contextUsed, prep.stats, Date.now() - startedAt, !!meta);

  if (conversation.title === 'محادثة جديدة') {
    updateConversation(conversation.id, { title: content.slice(0, 40) });
  }

  maybeExtractMemory({ assistant, conversationId: conversation.id, userContent: content, result: { content: full, model: prep.model, provider: prep.provider.id } }).catch(() => {});

  sse(res, 'done', {
    content: full,
    partial: false,
    error: null,
    model: prep.model,
    provider: prep.provider.id,
    contextUsed: prep.contextUsed,
    stats: prep.stats,
    generationMs: Date.now() - startedAt,
  });
  req.removeListener('close', onClose);
  return res.end();
});

function persistAssistant(conversationId, content, model, provider, contextUsed, stats, generationMs) {
  const user = all('SELECT * FROM messages WHERE conversation_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1', conversationId, 'user')[0];
  run(
    `INSERT INTO messages(id, conversation_id, parent_message_id, role, content, model, provider, tokens_out, generation_ms, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    uid('msg-'),
    conversationId,
    user?.id || null,
    'assistant',
    content,
    model,
    provider,
    null,
    generationMs,
    JSON.stringify({ contextUsed: contextUsed || {}, fallback: false, stats: stats || {} }),
  );
}

/* ---------------- Memory ---------------- */

r.get('/memory', (req, res) => {
  res.json(memoryService.listMemories({ query: req.query.q, type: req.query.type, sourceType: req.query.source, pinned: req.query.pinned === '1', archived: req.query.archived === '1', limit: Number(req.query.limit) || 100 }));
});
r.get('/memory/search', (req, res) => {
  const q = String(req.query.q || '');
  const rows = memoryService.searchMemories(q, { limit: Number(req.query.limit) || 8, type: req.query.type });
  res.json(rows);
});
r.get('/memory/types', (_req, res) => res.json(memoryService.memoryTypes()));
r.get('/memory/sources', (_req, res) => res.json(memoryService.memorySourceTypes()));
r.post('/memory/harvest', (req, res) => {
  const { added } = memoryService.catchUpHarvest({ days: Number(req.body?.days) || 7 });
  res.json({ ok: true, added });
});
r.get('/memory/:id/source', (req, res) => {
  const mem = memoryService.getMemory(req.params.id);
  if (!mem) return res.status(404).json({ error: 'not found' });
  res.json({ info: memoryService.sourceInfo(mem) });
});
r.post('/memory', (req, res) => {
  const b = req.body || {};
  const mem = memoryService.createMemory({
    content: b.content,
    type: b.type || 'general',
    importance: b.importance ?? 0.5,
    source: b.source || 'user',
    confidence: b.confidence ?? 0.5,
    tags: b.tags || [],
    pinned: !!b.pinned,
    aiAccess: b.ai_access !== false,
  });
  res.status(201).json(mem);
});
r.put('/memory/:id', (req, res) => {
  const mem = memoryService.updateMemory(req.params.id, req.body || {});
  if (!mem) return res.status(404).json({ error: 'not found' });
  res.json(mem);
});
r.delete('/memory/:id', (req, res) => {
  memoryService.deleteMemory(req.params.id);
  res.json({ ok: true });
});
r.delete('/memory', (_req, res) => {
  memoryService.deleteAllMemories();
  res.json({ ok: true });
});

/* ---------------- Knowledge ---------------- */

r.get('/knowledge', (_req, res) => {
  const bases = knowledgeService.listKnowledgeBases().map((kb) => ({
    ...kb,
    documents: knowledgeService.listDocuments(kb.id),
  }));
  res.json(bases);
});
r.post('/knowledge', (req, res) => {
  res.status(201).json(knowledgeService.createKnowledgeBase(req.body || {}));
});
r.delete('/knowledge/:id', (req, res) => {
  knowledgeService.deleteKnowledgeBase(req.params.id);
  res.json({ ok: true });
});
r.get('/knowledge/:id/documents', (req, res) => {
  res.json(knowledgeService.listDocuments(req.params.id));
});
r.post('/knowledge/import', async (req, res) => {
  const b = req.body || {};
  if (!b.kb_id || !b.filename || b.content === undefined) {
    return res.status(400).json({ error: 'kb_id, filename, content required' });
  }
  try {
    const result = await knowledgeService.importDocument({
      kbId: b.kb_id,
      filename: b.filename,
      content: String(b.content),
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
r.delete('/knowledge/documents/:id', (req, res) => {
  knowledgeService.deleteDocument(req.params.id);
  res.json({ ok: true });
});
r.get('/knowledge/search', (req, res) => {
  const { q, kb } = req.query;
  const kbIds = kb ? String(kb).split(',').filter(Boolean) : [];
  res.json(knowledgeService.searchKnowledge(String(q || ''), { kbIds, limit: Number(req.query.limit) || 6 }));
});

/* ---------------- AI helper endpoints ---------------- */

r.post('/ai/breakdown', async (req, res) => {
  const b = req.body || {};
  const text = String(b.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  const { provider, model } = resolveModel({ assistant: get('SELECT * FROM assistants WHERE slug = ? LIMIT 1', 'study') || null, conversation: null });
  if (!provider || !model) {
    return res.json({ ok: false, error: 'لا يوجد نموذج مكوّن' });
  }
  try {
    const result = await provider.generate({
      model,
      messages: [
        { role: 'system', content: 'قسّم المهمة التالية إلى خطوات عملية صغيرة مرقمة. أعد كل خطوة في سطر يبدأ برقم. لا تخرج أي نص آخر.' },
        { role: 'user', content: text },
      ],
    });
    const steps = result.content
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').replace(/^\s*[-•]\s*/, '').trim())
      .filter((l) => l && l.length > 1)
      .slice(0, 12);
    res.json({ ok: true, steps, fallback: false });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

r.post('/ai/suggest', async (req, res) => {
  // Cross-domain daily insight: ranked context from every module + recent
  // activity + pending link suggestions, synthesized by the local model.
  const gathered = gatherContext({ message: 'ملخص يومي ذكي', mode: 'planning' });
  const contextText = formatLifeContext(gathered, { tokenBudget: 1300 });
  const recentActivity = getRecentActivity({ limit: 5 }).map((a) => `- ${a.summary}`).join('\n');
  const pendingLinks = listLinkSuggestions({ status: 'pending', limit: 3 })
    .map((s) => `- ${s.source_title || s.source_type} ↔ ${s.target_title || s.target_type} (${s.reason || ''})`)
    .join('\n');

  const { provider, model } = resolveModel({ assistant: null, conversation: null });
  if (!provider || !model) {
    return res.json({ ok: true, suggestion: '', fallback: true });
  }
  try {
    const result = await provider.generate({
      model,
      messages: [
        {
          role: 'system',
          content:
            'أنت رفيق حياة هادئ داخل تطبيق شخصي. بناءً على بيانات المستخدم التالية، اكتب رؤية ذكية واحدة مترابطة (2-3 جمل كحد أقصى) تربط بين مجالات حياته المختلفة — مثلاً: "أنهيت 4 جلسات تركيز هذا الأسبوع، لكن مهامك المتبقية تتركز في الرياضيات المتقطعة وقبلها اختبار قريب، لذا الخطوة الأهم الآن مراجعة قواعد الاستنتاج."\nكن دقيقًا، لا تختلق بيانات غير موجودة، ولا تستخدم نبرة متحمسة مصطنعة، ولا توجّه اللوم.',
        },
        {
          role: 'user',
          content: [
            '— سياق اليوم —',
            contextText || '(لا توجد بيانات بعد)',
            '— نشاط حديث —',
            recentActivity || '(لا يوجد)',
            '— روابط مقترحة —',
            pendingLinks || '(لا يوجد)',
          ].join('\n'),
        },
      ],
      options: { temperature: 0.5, max_tokens: 220 },
    });
    res.json({ ok: true, suggestion: result.content.trim(), fallback: false, model: result.model });
  } catch (e) {
    res.json({ ok: true, suggestion: '', fallback: true });
  }
});

r.post('/ai/daily-summary', async (req, res) => {
  const today = dateKey();
  const done = all('SELECT * FROM tasks WHERE status = ? AND completed_at LIKE ?', 'done', `${today}%`).length;
  const remaining = all("SELECT * FROM tasks WHERE status NOT IN ('done','cancelled') AND due_date = ?", today).length;
  const study = all("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed = 1 AND started_at LIKE ?", `${today}%`)[0]?.m || 0;
  res.json({
    ok: true,
    summary: { date: today, completed: done, remaining, studyMinutes: study },
  });
});

/* ---------------- Contextual AI actions ---------------- */

r.post('/ai/action', async (req, res) => {
  const b = req.body || {};
  const action = String(b.action || '');
  const handler = ACTIONS[action];
  if (!handler) return res.status(400).json({ error: `unknown action: ${action}` });
  try {
    const result = await handler(b);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, fallback: true });
  }
});

/* ---------------- Contextual AI streaming assist ---------------- */

r.post('/ai/assist/stream', async (req, res) => {
  const b = req.body || {};
  // Accept `content` as a compatibility alias because the regular chat
  // endpoint uses that field name and older frontend builds reused it.
  const message = String(b.message || b.content || '').trim();
  const page = String(b.page || 'today');
  sseHeaders(res);
  if (!message) {
    sse(res, 'error', { message: 'الرسالة مطلوبة' });
    return res.end();
  }

  const prep = await runAssistTurn({ page, message, stream: true });
  if (!prep.provider || !prep.model) {
    sse(res, 'error', { message: NO_MODEL_MESSAGE });
    return res.end();
  }

  sse(res, 'start', { model: prep.model, provider: prep.provider.id });

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on('close', onClose);

  let full = '';
  const startedAt = Date.now();
  try {
    for await (const delta of prep.provider.stream({
      model: prep.model,
      messages: prep.messages,
      options: prep.options,
      signal: controller.signal,
    })) {
      full += delta;
      sse(res, 'delta', { delta });
    }
  } catch (e) {
    sse(res, 'error', { message: full ? 'انقطع الرد' : e.message });
    req.removeListener('close', onClose);
    return res.end();
  }
  sse(res, 'done', {
    content: full,
    partial: false,
    model: prep.model,
    provider: prep.provider.id,
    contextUsed: prep.contextUsed,
    generationMs: Date.now() - startedAt,
  });
  req.removeListener('close', onClose);
  return res.end();
});

/* ---------------- AI proposals & execution (chat → app) ---------------- */

r.post('/ai/propose', async (req, res) => {
  const b = req.body || {};
  const message = String(b.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const result = await proposeActions({ message, contextText: proposalContextText() });
  res.json(result);
});

r.post('/ai/execute', (req, res) => {
  const b = req.body || {};
  if (!b.proposal || !b.proposal.type) return res.status(400).json({ error: 'proposal required' });
  const result = executeProposal(b.proposal);
  res.json(result);
});

/* ---------------- Universal search ---------------- */

r.get('/search', (req, res) => {
  const q = String(req.query.q || '');
  const perGroup = Number(req.query.per_group) || 5;
  res.json(universalSearch(q, { perGroup }));
});

/* ---------------- Unified timeline ---------------- */

r.get('/timeline', (req, res) => {
  const days = Number(req.query.days) || 30;
  const domains = req.query.domains ? String(req.query.domains).split(',').filter(Boolean) : [];
  const limit = Number(req.query.limit) || 200;
  res.json(getTimeline({ days, domains, limit }));
});

/* ---------------- Life graph ---------------- */

r.get('/graph', (req, res) => {
  const typeFilter = req.query.types ? String(req.query.types).split(',').filter(Boolean) : [];
  res.json(graphQuery({ entityType: req.query.entity_type || null, entityId: req.query.entity_id || null, typeFilter }));
});

r.get('/graph/expand', (req, res) => {
  const { type, id } = req.query;
  if (!type || !id) return res.status(400).json({ error: 'type and id required' });
  res.json(graphQuery({ entityType: String(type), entityId: String(id), typeFilter: [] }));
});

/* ---------------- Entity links ---------------- */

r.get('/related/:type/:id', (req, res) => {
  const related = relatedEntities(req.params.type, req.params.id, { limit: 12 });
  const suggestions = listLinkSuggestions({ status: 'pending', limit: 20 }).filter(
    (s) =>
      (s.source_type === req.params.type && s.source_id === req.params.id) ||
      (s.target_type === req.params.type && s.target_id === req.params.id),
  );
  res.json({ type: req.params.type, id: req.params.id, related, suggestions });
});

r.post('/links', (req, res) => {
  const b = req.body || {};
  const link = createLink({
    sourceType: b.source_type,
    sourceId: b.source_id,
    targetType: b.target_type,
    targetId: b.target_id,
    relationshipType: b.relationship_type || 'related_to',
    confidence: b.confidence ?? 1,
    createdBy: 'user',
    metadata: b.metadata || {},
  });
  res.status(link ? 201 : 200).json({ ok: true, link });
});

r.delete('/links/:id', (req, res) => {
  removeLink(req.params.id);
  res.json({ ok: true });
});

r.get('/links/suggestions', (_req, res) => res.json(listLinkSuggestions({ status: 'pending' })));

r.post('/links/suggestions/:id/accept', (req, res) => {
  const link = acceptSuggestion(req.params.id);
  res.json({ ok: !!link, link });
});

r.post('/links/suggestions/:id/reject', (req, res) => {
  rejectSuggestion(req.params.id);
  res.json({ ok: true });
});

r.post('/links/discover', (req, res) => {
  const { type, id } = req.body || {};
  if (!type || !id) return res.status(400).json({ error: 'type and id required' });
  const result = suggestLinksForEntity(type, id);
  res.json(result);
});

r.get('/links/recent', (_req, res) => res.json(recentLinks({ limit: 8 })));

/* ---------------- Entity preview (hover) ---------------- */

r.get('/entities/preview', (req, res) => {
  const { type, id } = req.query;
  if (!type || !id) return res.status(400).json({ error: 'type and id required' });
  const row = titleForEntity(String(type), String(id));
  if (!row) return res.status(404).json({ error: 'not found' });
  const links = relatedEntities(String(type), String(id), { limit: 6 });
  res.json({ type: String(type), id: String(id), title: row.title || String(id), sub: row.sub || null, links });
});

/* ---------------- Smart context panel ---------------- */

r.get('/smart-context', (req, res) => {
  const page = String(req.query.page || 'today');
  res.json(smartContext({ page, focusType: req.query.focus_type || null, focusId: req.query.focus_id || null }));
});

/* ---------------- Conversation pinned context + mode ---------------- */

r.get('/conversations/:id/context', (req, res) => {
  res.json(getPinnedContext(req.params.id));
});

r.put('/conversations/:id/context', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  setPinnedContext(req.params.id, items.slice(0, 10));
  res.json(getPinnedContext(req.params.id));
});

r.get('/ai/context-modes', (_req, res) => res.json(CONTEXT_MODES));

/* ---------------- ACE — Aish Aman Context Engine ---------------- */

r.get('/ai/ace/status', (_req, res) => {
  res.json(getAceStatus());
});

r.post('/ai/ace/build', async (req, res) => {
  const b = req.body || {};
  const message = String(b.message || '').trim().slice(0, 2000);
  try {
    const packet = await buildContextPacketHybrid({
      message,
      mode: b.mode || 'general',
      debug: b.debug === true || b.debug === 'true',
    });
    res.json({
      packet,
      text: serializePacket(packet),
      debug: b.debug === true || b.debug === 'true' ? serializeDebug(packet) : undefined,
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

r.post('/ai/ace/daily', (_req, res) => {
  try {
    const { packet, summary } = buildDailyContext();
    res.json({ summary, packet: { intent: packet.intent, metadata: packet.metadata } });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

/* ---------------- Live voice conversation (OpenAI Realtime + WebRTC) ---------------- */

function findRealtimeProvider(preferredId) {
  if (preferredId) {
    const explicit = getProvider(preferredId);
    if (explicit?.apiKey && explicit?.baseUrl) return explicit;
  }
  const candidates = listProviders().filter((provider) => provider.type === 'openai-compatible' && provider.has_api_key);
  const openAi = candidates.find((provider) => /api\.openai\.com/i.test(provider.base_url || '')) || candidates[0];
  return openAi ? getProvider(openAi.id) : null;
}

function realtimeInstructions(body, conversation) {
  const assistant = resolveAssistant(body.assistant_id) || resolveAssistant(null);
  const pinnedContext = conversation ? getPinnedContext(conversation.id) : [];
  const gathered = gatherContext({
    message: 'محادثة صوتية مباشرة',
    mode: body.mode || conversation?.mode || 'general',
    pinnedContext,
  });
  const contextText = formatLifeContext(gathered, { tokenBudget: 1800 });
  const history = conversation ? getMessages(conversation.id).slice(-14) : [];
  const historyText = history.map((message) => `${message.role}: ${String(message.content || '').slice(0, 700)}`).join('\n');
  return [
    'أنت مساعد عِش آمن الشخصي. استخدم بيانات التطبيق المتاحة فقط ولا تختلق معلومات. احترم الخصوصية والسلامة، ولا تنفذ تغييرات من تلقاء نفسك.',
    assistant?.system_prompt || '',
    assistant?.response_style ? `أسلوب الرد: ${assistant.response_style}` : '',
    'هذه محادثة صوتية مباشرة. أجب طبيعيًا وباختصار ومن دون Markdown أو قوائم طويلة. انتظر نهاية كلام المستخدم قبل الرد، وتوقف فورًا عندما يقاطعك.',
    body.language === 'en' ? 'Prefer English unless the user changes language.' : 'تحدث بالعربية الطبيعية ما لم يغيّر المستخدم اللغة.',
    contextText ? `سياق عِش آمن:\n${contextText}` : '',
    historyText ? `آخر المحادثة الحالية:\n${historyText}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 24000);
}

r.post('/ai/realtime/call', async (req, res) => {
  const body = req.body || {};
  const sdp = String(body.sdp || '').trim().slice(0, 100000);
  if (!sdp.startsWith('v=0')) return res.status(400).json({ ok: false, error: 'عرض الاتصال الصوتي غير صالح.' });
  const provider = findRealtimeProvider(body.provider_id);
  if (!provider) return res.status(503).json({ ok: false, error: 'أضف مزود OpenAI مع مفتاح API من الإعدادات لتشغيل التكلم المباشر.' });
  const conversation = body.conversation_id ? getConversation(String(body.conversation_id)) : null;
  const model = String(process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1-mini').trim();
  const voice = String(body.voice || process.env.OPENAI_REALTIME_VOICE || 'alloy').trim();
  const language = body.language === 'en' ? 'en' : 'ar';
  const session = {
    type: 'realtime',
    model,
    instructions: realtimeInstructions(body, conversation),
    audio: {
      input: {
        noise_reduction: { type: 'near_field' },
        transcription: { model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe', language },
        turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true, eagerness: 'auto' },
      },
      output: { voice, speed: 1 },
    },
  };
  try {
    const headers = { ...provider.headers, Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/sdp' };
    const upstream = await fetchWithTimeout(`${provider.baseUrl}/realtime/calls?model=${encodeURIComponent(model)}`, { method: 'POST', headers, body: sdp }, provider.timeoutMs);
    const answer = await upstream.text();
    if (!upstream.ok) {
      let detail = answer;
      try { detail = JSON.parse(answer)?.error?.message || answer; } catch { /* plain response */ }
      if (upstream.status === 401 || upstream.status === 403) throw new Error('مفتاح OpenAI غير صحيح أو لا يملك صلاحية Realtime.');
      if (upstream.status === 429) throw new Error('تم بلوغ حد استخدام OpenAI أو الرصيد. راجع الفوترة ثم أعد المحاولة.');
      throw new Error(`OpenAI Realtime: ${String(detail).slice(0, 240)}`);
    }
    if (!answer.trim().startsWith('v=0')) throw new Error('أعادت خدمة OpenAI جواب اتصال صوتي غير صالح. أعد المحاولة.');
    return res.json({ ok: true, sdp: answer, model, voice, session });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || 'تعذر بدء المحادثة الصوتية.' });
  }
});

r.post('/voice/turn', (req, res) => {
  const body = req.body || {};
  const userText = String(body.user_text || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  const assistantText = String(body.assistant_text || '').replace(/\s+/g, ' ').trim().slice(0, 24000);
  if (!userText || !assistantText) return res.status(400).json({ error: 'النص الصوتي غير مكتمل.' });
  let conversation = body.conversation_id ? getConversation(String(body.conversation_id)) : null;
  if (!conversation) {
    conversation = createConversation({
      title: userText.slice(0, 60) || 'محادثة صوتية',
      assistantId: body.assistant_id,
      model: body.model || 'gpt-realtime-2.1-mini',
      providerId: body.provider || 'openai-realtime',
      mode: body.mode || 'general',
    });
  }
  const userMessage = saveMessage({ id: uid('msg-'), conversation_id: conversation.id, role: 'user', content: userText });
  saveMessage({
    id: uid('msg-'),
    conversation_id: conversation.id,
    parent_message_id: userMessage.id,
    role: 'assistant',
    content: assistantText,
    model: body.model || 'gpt-realtime-2.1-mini',
    provider: body.provider || 'openai-realtime',
    metadata: { voice: true },
  });
  updateConversation(conversation.id, { model: body.model || conversation.model, providerId: body.provider || conversation.provider_id });
  return res.json({ conversation_id: conversation.id, user_text: userText, assistant_text: assistantText });
});

/* ---------------- Neural text-to-speech ---------------- */

r.get('/ai/tts/status', (_req, res) => {
  res.json({
    edge: true,
    openaiProviders: listProviders()
      .filter((p) => p.type === 'openai-compatible')
      .map((p) => ({ id: p.id, name: p.name, has_api_key: p.has_api_key })),
  });
});

/** Resolve a TTS-capable OpenAI provider: the requested one, else any keyed one. */
function findTtsProvider(preferredId) {
  if (preferredId) {
    const provider = getProvider(preferredId);
    if (provider && typeof provider.tts === 'function') return provider;
  }
  for (const info of listProviders()) {
    if (info.type !== 'openai-compatible' || !info.has_api_key) continue;
    const provider = getProvider(info.id);
    if (provider && typeof provider.tts === 'function') return provider;
  }
  return null;
}

r.post('/ai/tts', async (req, res) => {
  const b = req.body || {};
  const text = String(b.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'text required' });

  const engine = ['edge', 'openai', 'auto'].includes(b.engine) ? b.engine : 'auto';
  const lang = b.lang === 'en' ? 'en' : 'ar';
  const speed = Math.min(2, Math.max(0.5, Number(b.speed) || 1));

  // 'auto' prefers a real ChatGPT-style voice (any OpenAI-compatible provider),
  // then falls back to the free Edge neural voices.
  const wantOpenAI = engine === 'openai' || engine === 'auto';

  if (wantOpenAI) {
    const provider = findTtsProvider(b.provider_id);
    if (provider) {
      try {
        const audio = await synthesizeOpenAI({
          provider,
          text,
          model: b.model || 'tts-1',
          voice: openaiVoiceFor(lang, b.voice),
          speed,
        });
        return res.json({ ok: true, engine: 'openai', format: 'mp3', audio: audio.toString('base64') });
      } catch (error) {
        if (engine === 'openai') {
          return res.status(502).json({ error: error.message });
        }
        // engine === 'auto': fall through to the free Edge voices.
      }
    } else if (engine === 'openai') {
      return res.status(400).json({ error: 'أضف مزود OpenAI مع مفتاح API من الإعدادات لتشغيل صوت Alloy.' });
    }
  }

  try {
    const audio = await synthesizeEdge({
      text,
      voice: b.voice_edge,
      rate: speed,
      lang,
    });
    res.json({ ok: true, engine: 'edge', format: 'mp3', audio: audio.toString('base64') });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

export default r;
