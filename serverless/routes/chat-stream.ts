import {
  DEEPSEEK_PROVIDER_ID,
  authContext,
  assistantPrompt,
  buildCloudContext,
  conversationHistory,
  corsNoStore,
  deepSeek,
  ensureConversation,
  loadAssistant,
  proxyDeepSeekStream,
  sbInsert,
  sbUpdate,
  selectedModel,
  sendSse,
  uid,
} from '../cloud-ai';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  corsNoStore(res);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Connection', 'keep-alive');

  const content = String(req.body?.content || '').trim();
  if (!content) {
    sendSse(res, 'error', { message: 'المحتوى مطلوب' });
    return res.end();
  }

  try {
    const ctx = await authContext(req);
    if (!ctx) {
      sendSse(res, 'error', { message: 'سجّل الدخول أولًا حتى يستطيع عيش آمن قراءة بياناتك بأمان.' });
      return res.end();
    }

    const regenerate = req.body?.regenerate === true;
    const model = selectedModel(req.body?.model);
    const conversation = await ensureConversation(ctx, {
      conversationId: req.body?.conversation_id,
      content,
      assistantId: req.body?.assistant_id,
      model,
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: req.body?.mode || 'general',
    });
    const assistant = await loadAssistant(ctx, req.body?.assistant_id);
    const history = await conversationHistory(ctx, conversation.id, 24);
    const context = await buildCloudContext(ctx, { message: content, mode: req.body?.mode || conversation.mode || 'general', conversation });

    const system = `${assistantPrompt(assistant, req.body?.mode || conversation.mode || 'general')}\n\n# سياق عيش آمن الحالي\n${context.text || 'لا توجد بيانات سياق متاحة بعد.'}`;
    const recentHistory = history.slice(-20);
    const historyAlreadyEndsWithPrompt = regenerate
      && recentHistory.at(-1)?.role === 'user'
      && recentHistory.at(-1)?.content.trim() === content;
    const messages = [
      { role: 'system', content: system },
      ...recentHistory,
      ...(historyAlreadyEndsWithPrompt ? [] : [{ role: 'user', content }]),
    ];

    const userMessage = regenerate ? null : await sbInsert(ctx, 'messages', {
      id: uid('msg-'), conversation_id: conversation.id, role: 'user', content,
      model: null, provider: null, metadata: null,
    });
    await sbUpdate(ctx, 'conversations', conversation.id, {
      assistant_id: req.body?.assistant_id || conversation.assistant_id || null,
      provider_id: DEEPSEEK_PROVIDER_ID,
      model,
      mode: req.body?.mode || conversation.mode || 'general',
      updated_at: new Date().toISOString(),
    });

    sendSse(res, 'start', { conversation_id: conversation.id, model, provider: DEEPSEEK_PROVIDER_ID });

    const started = Date.now();
    const deepResponse = await deepSeek(messages, { model, stream: true, maxTokens: 1100 });
    let full = '';
    await proxyDeepSeekStream(deepResponse, (delta) => {
      full += delta;
      sendSse(res, 'delta', { delta });
    });

    await sbInsert(ctx, 'messages', {
      id: uid('msg-'), conversation_id: conversation.id, parent_message_id: userMessage?.id || null,
      role: 'assistant', content: full, model, provider: DEEPSEEK_PROVIDER_ID,
      generation_ms: Date.now() - started,
      metadata: { contextUsed: { ...context.contextUsed, historyMessages: history.length }, fallback: false },
    });
    await sbUpdate(ctx, 'conversations', conversation.id, { updated_at: new Date().toISOString() });

    // Keep the interactive request fast on Vercel Hobby.
    // Automatic memory extraction should run as a separate follow-up action, not block the chat response.

    sendSse(res, 'done', {
      content: full, partial: false, model, provider: DEEPSEEK_PROVIDER_ID,
      contextUsed: { ...context.contextUsed, historyMessages: history.length },
      generationMs: Date.now() - started,
    });
    return res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    sendSse(res, 'error', { message });
    return res.end();
  }
}
