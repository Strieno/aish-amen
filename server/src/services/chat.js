import { all, get, run, transaction } from '../db/index.js';
import { getSetting } from './settings.js';
import { getProvider, getPrimaryProvider } from '../providers/index.js';
import { buildPrompt } from './prompt-engine.js';
import { buildContext } from './context-builder.js';
import { uid, nowIso, parseJson, trimMessages } from '../lib/util.js';
import { createMemory } from './memory.js';
import { logEvent } from '../db/index.js';
import { emitDomainEvent, EVENT_TYPES } from './events.js';

export function listConversations({ q } = {}) {
  const where = q ? 'WHERE title LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.content LIKE ?)' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  return all(
    `SELECT c.*, a.name AS assistant_name,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
            (SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_message_at
     FROM conversations c LEFT JOIN assistants a ON a.id = c.assistant_id
     ${where}
     ORDER BY c.pinned DESC, COALESCE(c.updated_at, c.created_at) DESC`,
    ...params,
  ).map((r) => ({ ...r, tags: parseJson(r.tags, []), pinned: !!r.pinned }));
}

export function getConversation(id) {
  const row = get('SELECT * FROM conversations WHERE id = ?', id);
  if (!row) return null;
  return { ...row, tags: parseJson(row.tags, []), pinned: !!row.pinned };
}

export function createConversation({ title, assistantId, model, providerId, folder, tags = [], mode = 'general' }) {
  const id = uid('conv-');
  const now = nowIso();
  run(
    'INSERT INTO conversations(id, title, assistant_id, provider_id, model, folder, tags, mode, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id,
    title || 'محادثة جديدة',
    assistantId || null,
    providerId || null,
    model || null,
    folder || null,
    JSON.stringify(tags),
    mode,
    now,
    now,
  );
  emitDomainEvent(EVENT_TYPES.CONVERSATION_CREATED, { entityType: 'conversation', entityId: id, title: title || 'محادثة جديدة' });
  return getConversation(id);
}

export function updateConversation(id, patch) {
  const existing = getConversation(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  run(
    'UPDATE conversations SET title=?, assistant_id=?, provider_id=?, model=?, folder=?, pinned=?, tags=?, mode=?, updated_at=? WHERE id=?',
    next.title,
    next.assistantId ?? existing.assistant_id,
    next.providerId ?? existing.provider_id,
    next.model ?? existing.model,
    next.folder ?? existing.folder,
    next.pinned ? 1 : 0,
    JSON.stringify(next.tags || []),
    next.mode ?? existing.mode ?? 'general',
    nowIso(),
    id,
  );
  return getConversation(id);
}

export function deleteConversation(id) {
  run('DELETE FROM conversations WHERE id = ?', id);
}

export function getMessages(conversationId) {
  return all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', conversationId);
}

export function getMessage(id) {
  return get('SELECT * FROM messages WHERE id = ?', id);
}

export function saveMessage(msg) {
  run(
    'INSERT INTO messages(id, conversation_id, parent_message_id, role, content, model, provider, tokens_in, tokens_out, generation_ms, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    msg.id,
    msg.conversation_id,
    msg.parent_message_id || null,
    msg.role,
    msg.content,
    msg.model || null,
    msg.provider || null,
    msg.tokens_in ?? null,
    msg.tokens_out ?? null,
    msg.generation_ms ?? null,
    msg.metadata ? JSON.stringify(msg.metadata) : null,
  );
  if (msg.role === 'user') {
    emitDomainEvent(EVENT_TYPES.CONVERSATION_MESSAGE_CREATED, { entityType: 'conversation', entityId: msg.conversation_id, summary: msg.content.slice(0, 80) });
  }
  return getMessage(msg.id);
}

export function updateMessage(id, patch) {
  const existing = getMessage(id);
  if (!existing) return null;
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    params.push(typeof v === 'object' ? JSON.stringify(v) : v);
  }
  if (!sets.length) return existing;
  params.push(id);
  run(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`, ...params);
  return getMessage(id);
}

export function deleteMessage(id) {
  const m = getMessage(id);
  if (!m) return;
  run('DELETE FROM messages WHERE id = ?', id);
}

/**
 * Resolve the provider + model for a request, with fallback support.
 * Order: conversation model -> assistant model -> settings default model
 * -> primary provider default -> primary provider's first model.
 */
export function resolveModel({ assistant, conversation }) {
  const defaultModel = getSetting('ai')?.defaultModel || null;
  const requestedProviderId = conversation?.provider_id || assistant?.provider_id || null;
  const requestedModel = conversation?.model || assistant?.model || null;
  const primaryProvider = getPrimaryProvider();

  const resolveCachedPair = (model, preferredProviderId = null) => {
    if (!isLikelyChatModel(model)) return null;
    const matches = all('SELECT provider_id FROM ai_models WHERE model_id = ?', model);
    if (!matches.length) return null;
    const row = matches.find((item) => item.provider_id === preferredProviderId)
      || matches.find((item) => item.provider_id === primaryProvider?.id)
      || matches[0];
    const provider = getProvider(row.provider_id);
    return provider ? { provider, model } : null;
  };

  // A stored model without a provider is resolved through the cached catalog.
  // This prevents an OpenAI model name from being sent to Ollama (or vice versa).
  const requested = resolveCachedPair(requestedModel, requestedProviderId);
  if (requested) return requested;

  const configuredDefault = resolveCachedPair(defaultModel, primaryProvider?.id);
  if (configuredDefault) return configuredDefault;

  const preferredProvider = (requestedProviderId && getProvider(requestedProviderId)) || primaryProvider;
  if (preferredProvider) {
    const first = getModelsForProvider(preferredProvider.id).find((item) => isLikelyChatModel(item.model_id));
    if (first) return { provider: preferredProvider, model: first.model_id };
  }

  const firstAvailable = all('SELECT provider_id, model_id FROM ai_models ORDER BY display_name')
    .find((item) => isLikelyChatModel(item.model_id));
  if (firstAvailable) {
    const provider = getProvider(firstAvailable.provider_id);
    if (provider) return { provider, model: firstAvailable.model_id };
  }
  return { provider: null, model: null };
}

export function isLikelyChatModel(model) {
  if (!model) return false;
  return !/^(?:babbage|davinci|text-embedding|whisper|tts-|gpt-(?:audio|image|live|realtime|transcribe)|chatgpt-image|omni-moderation|sora-)/i.test(model);
}

export function isModelAvailableForProvider(providerId, model) {
  if (!providerId || !isLikelyChatModel(model)) return false;
  return !!get('SELECT 1 FROM ai_models WHERE provider_id = ? AND model_id = ?', providerId, model);
}

export function getModelsForProvider(providerId) {
  return all('SELECT * FROM ai_models WHERE provider_id = ? ORDER BY display_name', providerId);
}

/** Pinned entity context for a conversation (user-attached entities). */
export function getPinnedContext(conversationId) {
  if (!conversationId) return [];
  const row = get('SELECT context FROM conversations WHERE id = ?', conversationId);
  if (!row?.context) return [];
  const parsed = parseJson(row.context, []);
  return Array.isArray(parsed) ? parsed.filter((p) => p && p.type && p.id) : [];
}

export function setPinnedContext(conversationId, items) {
  run('UPDATE conversations SET context = ? WHERE id = ?', JSON.stringify(items || []), conversationId);
}

export function cacheModels(providerId, models) {
  run('DELETE FROM ai_models WHERE provider_id = ?', providerId);
  for (const m of models) {
    run(
      'INSERT INTO ai_models(id, provider_id, model_id, display_name, context_limit, capabilities, last_seen) VALUES (?,?,?,?,?,?,?)',
      uid('am-'),
      providerId,
      m.id,
      m.name || m.id,
      m.contextLimit || null,
      JSON.stringify(m.capabilities || []),
      nowIso(),
    );
  }
}

const FALLBACK_RESPONSE =
  'تعذر الاتصال بنموذج الذكاء الاصطناعي المحلي.\n\nتأكد من أن خادم Ollama أو الخادم المكوّن يعمل، ثم أعد المحاولة. يمكنك إعداد الاتصال من الإعدادات.';

export const NO_MODEL_MESSAGE =
  'لم يتم ربط نموذج ذكاء اصطناعي بعد.\n\nيمكنك ربط: Ollama أو LM Studio أو أي خادم OpenAI-compatible من الإعدادات.';

export function pageAssistant(page) {
  const slugMap = {
    safe: 'safe-living',
    study: 'study',
    work: 'work',
    journal: 'journal',
    programming: 'programming',
  };
  const slug = slugMap[page];
  if (slug) {
    const a = get('SELECT * FROM assistants WHERE slug = ? LIMIT 1', slug);
    if (a) return a;
  }
  return get('SELECT * FROM assistants WHERE is_default = 1 LIMIT 1') || null;
}

/**
 * One-off model call for small AI features. Returns a structured result.
 */
export async function oneShot({ systemPrompt, userContent, assistant = null, maxTokens = null }) {
  const resolved = resolveModel({ assistant, conversation: null });
  if (!resolved.provider || !resolved.model) {
    return { ok: false, error: 'لا يوجد نموذج مكوّن', fallback: true };
  }
  try {
    const result = await resolved.provider.generate({
      model: resolved.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      options: {
        temperature: 0.5,
        max_tokens: maxTokens || 1200,
        context_size: null,
        top_p: null,
      },
    });
    return { ok: true, text: result.content.trim(), model: result.model, provider: resolved.provider.id, fallback: false };
  } catch (e) {
    logEvent('error', 'ai', `AI action failed: ${e.message}`);
    return { ok: false, error: e.message, fallback: true };
  }
}

/**
 * Contextual assist turn for the floating assistant: builds page context,
 * streams (or generates) using the page-appropriate persona.
 */
export async function runAssistTurn({ page, message, stream = false, signal, mode = 'general' }) {
  const assistant = pageAssistant(page);
  const pageCtx = buildPageContext(page);
  const context = buildContext({ assistant, userMessage: message, mode });
  const resolved = resolveModel({ assistant, conversation: null });
  if (!resolved.provider || !resolved.model) {
    return { content: NO_MODEL_MESSAGE, fallback: true, error: 'لا يوجد نموذج مكوّن', contextUsed: {}, stats: {} };
  }

  const pageContextText = pageCtx ? `سياق الصفحة الحالية (${page}):\n${pageCtx}` : '';
  const history = [];
  const { messages, contextUsed, stats } = buildPrompt({ assistant, history, userMessage: message, context });
  // Inject page context as a user-level note right before the real message.
  if (pageContextText) {
    messages.splice(messages.length - 1, 0, { role: 'user', content: pageContextText });
  }

  const options = {
    temperature: assistant?.temperature ?? 0.6,
    max_tokens: getSetting('ai')?.modelParams?.maxTokens || null,
    context_size: getSetting('ai')?.modelParams?.contextSize || null,
    top_p: getSetting('ai')?.modelParams?.topP || null,
    // The floating assistant is a quick-help surface. Thinking-capable Ollama
    // models can otherwise spend a long time reasoning before emitting text.
    think: false,
  };

  if (stream) return { provider: resolved.provider, model: resolved.model, messages, options, contextUsed, stats };
  try {
    const result = await resolved.provider.generate({ model: resolved.model, messages, options, signal });
    return { ...result, providerObj: resolved.provider, contextUsed, stats, fallback: false };
  } catch (e) {
    logEvent('error', 'ai', `Assist generation failed: ${e.message}`);
    return { content: FALLBACK_RESPONSE, fallback: true, error: e.message, contextUsed, stats };
  }
}

/** Compact, non-sensitive summary of the current page for AI context. */
export function buildPageContext(page) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  switch (page) {
    case 'tasks': {
      const rows = all("SELECT title, priority, status FROM tasks WHERE status NOT IN ('done','cancelled') ORDER BY priority LIMIT 15");
      lines.push(rows.length ? rows.map((r) => `- [${r.priority}] ${r.title} (${r.status})`).join('\n') : 'لا توجد مهام مفتوحة.');
      break;
    }
    case 'journal': {
      const rows = all('SELECT title, entry_date, mood FROM journal_entries WHERE ai_access = 1 ORDER BY entry_date DESC LIMIT 5');
      lines.push(rows.length ? rows.map((r) => `- ${r.entry_date}: ${r.title || 'بدون عنوان'}${r.mood ? ` (مزاج: ${r.mood})` : ''}`).join('\n') : 'لا توجد إدخالات يوميات.');
      break;
    }
    case 'study': {
      const rows = all(
        `SELECT c.name, c.code,
                (SELECT COUNT(*) FROM exams e WHERE e.course_id = c.id AND e.exam_date >= date('now')) AS exams
         FROM courses c ORDER BY c.created_at DESC LIMIT 8`,
      );
      lines.push(rows.length ? rows.map((r) => `- ${r.name}${r.exams ? ` (امتحانات قادمة: ${r.exams})` : ''}`).join('\n') : 'لا توجد مواد.');
      break;
    }
    case 'work': {
      const shifts = all('SELECT shift_start, role FROM work_shifts ORDER BY shift_start DESC LIMIT 5');
      const notes = all('SELECT title FROM work_notes ORDER BY updated_at DESC LIMIT 5');
      if (shifts.length) lines.push('المناوبات:\n' + shifts.map((s) => `- ${s.shift_start.slice(0, 16)} ${s.role || ''}`).join('\n'));
      if (notes.length) lines.push('ملاحظات العمل:\n' + notes.map((n) => `- ${n.title}`).join('\n'));
      break;
    }
    case 'safe': {
      const plan = get(
        `SELECT sp.name FROM safe_living_sessions s JOIN safe_living_plans sp ON sp.id = s.plan_id WHERE s.status = 'active' ORDER BY s.activated_at DESC LIMIT 1`,
      );
      const status = all("SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('done','cancelled') AND priority = 'high' AND (due_date IS NULL OR due_date = ?)", today)[0];
      lines.push(plan ? `الخطة النشطة: ${plan.name}` : 'لا توجد خطة عيش آمن نشطة.');
      lines.push(`مهام مستعجلة اليوم: ${status?.n || 0}`);
      break;
    }
    case 'goals': {
      const rows = all('SELECT title, life_area, progress FROM goals WHERE status = ? ORDER BY created_at DESC LIMIT 8', 'active');
      lines.push(rows.length ? rows.map((r) => `- ${r.title} (${r.life_area || 'عام'}) ${r.progress}`).join('\n') : 'لا توجد أهداف نشطة.');
      break;
    }
    case 'memory': {
      const rows = all('SELECT content, type, importance FROM memories WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC LIMIT 6');
      lines.push(rows.length ? rows.map((r) => `- [${r.type}] ${r.content.slice(0, 80)}`).join('\n') : 'لا توجد ذكريات.');
      break;
    }
    case 'knowledge': {
      const rows = all(
        `SELECT kb.name, (SELECT COUNT(*) FROM documents d WHERE d.kb_id = kb.id) AS docs
         FROM knowledge_bases kb ORDER BY kb.created_at`,
      );
      lines.push(rows.length ? rows.map((r) => `- ${r.name} (${r.docs} مستند)`).join('\n') : 'لا توجد قواعد معرفة.');
      break;
    }
    case 'audio': {
      const scenes = all('SELECT name FROM sound_scenes ORDER BY created_at LIMIT 5');
      const files = all('SELECT title, category FROM audio_files ORDER BY favorite DESC LIMIT 5');
      if (scenes.length) lines.push('المشاهد الصوتية: ' + scenes.map((s) => s.name).join('، '));
      if (files.length) lines.push('الأصوات: ' + files.map((f) => f.title).join('، '));
      break;
    }
    case 'focus': {
      const rows = all('SELECT minutes, completed, started_at FROM focus_sessions ORDER BY started_at DESC LIMIT 5');
      lines.push(rows.length ? rows.map((r) => `- ${r.minutes}د ${r.completed ? 'مكتملة' : 'ناقصة'} (${r.started_at.slice(0, 10)})`).join('\n') : 'لا توجد جلسات تركيز.');
      break;
    }
    case 'insights': {
      const { getInsights } = awaitImportInsights();
      lines.push(JSON.stringify(getInsights()));
      break;
    }
    default: {
      const tasks = all("SELECT title, priority FROM tasks WHERE status NOT IN ('done','cancelled') AND (due_date IS NULL OR due_date = ?) ORDER BY priority LIMIT 8", today);
      const events = all('SELECT title, start FROM calendar_events WHERE start LIKE ? ORDER BY start LIMIT 5', `${today}%`);
      const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today);
      if (tasks.length) lines.push('مهام اليوم:\n' + tasks.map((t) => `- [${t.priority}] ${t.title}`).join('\n'));
      if (events.length) lines.push('جدول اليوم:\n' + events.map((e) => `- ${e.start.slice(11, 16)} ${e.title}`).join('\n'));
      if (checkin) lines.push(`تسجيل الحالة: طاقة ${checkin.energy || '—'}، ضغط ${checkin.stress || '—'}، نوم ${checkin.sleep_hours || '—'}س`);
      break;
    }
  }
  return lines.join('\n');
}

async function awaitImportInsights() {
  const mod = await import('./insights.js');
  return mod;
}

/**
 * Run a full chat turn: build context, build prompt, generate (streaming or not).
 * Returns structured result including contextUsed for the Memory Inspector.
 */
export async function runChatTurn({ conversation, assistant, userContent, model, provider, stream = false, signal }) {
  const resolved = provider && model && isModelAvailableForProvider(provider.id, model)
    ? { provider, model }
    : resolveModel({ assistant, conversation });
  if (!resolved.provider || !resolved.model) {
    return {
      content: FALLBACK_RESPONSE,
      fallback: true,
      error: 'لا يوجد نموذج مكوّن',
      contextUsed: {},
      stats: {},
    };
  }

  const history = getMessages(conversation.id)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
  const trimmed = trimMessages(history, getSetting('ai')?.contextBudget?.conversation || 4000);

  const mode = conversation?.mode || 'general';
  const pinnedContext = getPinnedContext(conversation?.id);
  const context = buildContext({ assistant, userMessage: userContent, mode, pinnedContext });
  const { messages, contextUsed, stats } = buildPrompt({
    assistant,
    history: trimmed,
    userMessage: userContent,
    context,
  });

  const options = {
    temperature: assistant?.temperature ?? 0.6,
    max_tokens: getSetting('ai')?.modelParams?.maxTokens || null,
    context_size: getSetting('ai')?.modelParams?.contextSize || null,
    top_p: getSetting('ai')?.modelParams?.topP || null,
  };

  if (stream) {
    return { provider: resolved.provider, model: resolved.model, messages, contextUsed, stats, options };
  }

  try {
    const result = await resolved.provider.generate({
      model: resolved.model,
      messages,
      options,
      signal,
    });
    return {
      ...result,
      providerObj: resolved.provider,
      contextUsed,
      stats,
      fallback: false,
    };
  } catch (e) {
    logEvent('error', 'ai', `Chat generation failed: ${e.message}`);
    return {
      content: FALLBACK_RESPONSE,
      fallback: true,
      error: e.message,
      contextUsed,
      stats,
      provider: resolved.provider?.id,
      model: resolved.model,
    };
  }
}

export function persistTurn({ conversation, assistantId, userContent, userMsgId, result, assistantContent }) {
  const now = nowIso();
  transaction(() => {
    const userMessage = saveMessage({
      id: userMsgId || uid('msg-'),
      conversation_id: conversation.id,
      role: 'user',
      content: userContent,
    });
    const assistantMessage = saveMessage({
      id: uid('msg-'),
      conversation_id: conversation.id,
      parent_message_id: userMessage.id,
      role: 'assistant',
      content: assistantContent,
      model: result.model || null,
      provider: result.provider || null,
      tokens_in: result.tokensIn ?? null,
      tokens_out: result.tokensOut ?? null,
      generation_ms: result.generationMs ?? null,
      metadata: { contextUsed: result.contextUsed || {}, fallback: !!result.fallback },
    });
    run(
      'UPDATE conversations SET updated_at = ?, title = COALESCE(NULLIF(title, \'\'), ?) WHERE id = ?',
      now,
      assistantContent.slice(0, 40),
      conversation.id,
    );
    return assistantMessage;
  });
}

export async function maybeExtractMemory({ assistant, conversationId, userContent, result }) {
  const autoMem = getSetting('ai')?.autoMemory;
  if (autoMem !== true || !result || result.fallback) return null;
  if (!assistant) return null;
  const perms = parseJson(assistant.memory_permissions, {});
  if (perms.memory === false) return null;
  try {
    const provider = getPrimaryProvider();
    if (!provider) return null;
    const g = await provider.generate({
      model: null,
      messages: [
        {
          role: 'system',
          content:
            'استخرج ذكرى واحدة قصيرة ومفيدة من المحادثة التالية إذا كانت تحتوي معلومة دائمة عن المستخدم (تفضيل، حقيقة، حدث مهم). أعد فقط نص الذكرى، أو كلمة NONE إن لم توجد.',
        },
        { role: 'user', content: `المحادثة:\n${userContent}\n\nالرد:\n${result.content}` },
      ],
    });
    const text = g.content.trim();
    if (!text || text === 'NONE' || text.length > 400) return null;
    return createMemory({ content: text, type: 'ai', source: 'conversation', importance: 0.6, confidence: 0.7 });
  } catch {
    return null;
  }
}
