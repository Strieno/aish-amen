import {
  DEEPSEEK_PROVIDER_ID,
  authContext,
  assistantPrompt,
  buildCloudContext,
  corsNoStore,
  deepSeek,
  loadAssistant,
  proxyDeepSeekStream,
  selectedModel,
  sendSse,
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

  try {
    const ctx = await authContext(req);
    if (!ctx) {
      sendSse(res, 'error', { message: 'سجّل الدخول أولًا.' });
      return res.end();
    }
    const assistant = await loadAssistant(ctx, req.body?.assistant_id, page);
    const context = await buildCloudContext(ctx, { message, mode: req.body?.mode || 'general', page });
    const model = selectedModel(req.body?.model);
    const system = `${assistantPrompt(assistant, req.body?.mode || 'general', page)}\n\n# بيانات الصفحة والحياة ذات الصلة\n${context.text || 'لا توجد بيانات سياق متاحة بعد.'}`;
    const panelHistory = (Array.isArray(req.body?.history) ? req.body.history : [])
      .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
      .slice(-12)
      .map((item: any) => ({ role: item.role, content: String(item.content).slice(0, 5000) }));

    sendSse(res, 'start', { conversation_id: '', model, provider: DEEPSEEK_PROVIDER_ID });
    const started = Date.now();
    const response = await deepSeek([
      { role: 'system', content: system },
      ...panelHistory,
      { role: 'user', content: message },
    ], { model, stream: true, maxTokens: 1800 });

    let full = '';
    await proxyDeepSeekStream(response, (delta) => {
      full += delta;
      sendSse(res, 'delta', { delta });
    });
    sendSse(res, 'done', { content: full, partial: false, model, provider: DEEPSEEK_PROVIDER_ID, contextUsed: context.contextUsed, generationMs: Date.now() - started });
    return res.end();
  } catch (error) {
    sendSse(res, 'error', { message: error instanceof Error ? error.message : 'AI request failed' });
    return res.end();
  }
}
