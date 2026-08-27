import {
  authContext,
  assistantPrompt,
  buildCloudContext,
  corsNoStore,
  loadAssistant,
  resolveCloudSelection,
  sendSse,
  streamCloudText,
} from '../cloud-ai';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  corsNoStore(res);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Connection', 'keep-alive');

  const message = String(req.body?.message || req.body?.content || '').trim();
  const page = String(req.body?.page || 'today');
  if (!message) {
    sendSse(res, 'error', { message: 'الرسالة مطلوبة' });
    return res.end();
  }
  if (message.length > 12000) {
    sendSse(res, 'error', { message: 'الرسالة طويلة جدًا. اختصرها إلى أقل من 12,000 حرف ثم حاول مجددًا.' });
    return res.end();
  }

  try {
    const ctx = await authContext(req);
    if (!ctx) {
      sendSse(res, 'error', { message: 'سجّل الدخول أولًا.' });
      return res.end();
    }
    const assistant = await loadAssistant(ctx, req.body?.assistant_id, page);
    const context = await buildCloudContext(ctx, { message, mode: req.body?.mode || 'general', page });
    const selection = resolveCloudSelection(req.body?.provider_id, req.body?.model);
    const model = selection.model;
    const providerId = selection.providerId;
    const system = `${assistantPrompt(assistant, req.body?.mode || 'general', page)}\n\n# بيانات الصفحة والحياة ذات الصلة\n${context.text || 'لا توجد بيانات سياق متاحة بعد.'}`;
    const panelHistory = (Array.isArray(req.body?.history) ? req.body.history : [])
      .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
      .slice(-12)
      .map((item: any) => ({ role: item.role, content: String(item.content).slice(0, 5000) }));

    sendSse(res, 'start', { conversation_id: '', model, provider: providerId });
    const started = Date.now();
    const result = await streamCloudText([
      { role: 'system', content: system },
      ...panelHistory,
      { role: 'user', content: message },
    ], { providerId, model, maxTokens: 1800 }, (delta) => {
      sendSse(res, 'delta', { delta });
    });
    sendSse(res, 'done', {
      content: result.content,
      partial: result.partial,
      warning: result.warning,
      model: result.model,
      provider: result.provider,
      contextUsed: context.contextUsed,
      generationMs: Date.now() - started,
    });
    return res.end();
  } catch (error) {
    if (!res.writableEnded) sendSse(res, 'error', { message: error instanceof Error ? error.message : 'AI request failed' });
    return res.end();
  }
}
