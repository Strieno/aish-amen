import { assertCloudAiAllowed, authContext, conversationHistory, generateText, loadConversation, parseJsonObject } from '../cloud-ai';
export const config = { maxDuration: 30 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ ok: false, error: 'Authentication required' });
    await assertCloudAiAllowed(ctx);
    const id = String(req.query?.id || '');
    const conversation = await loadConversation(ctx, id);
    if (!conversation) return res.status(404).json({ ok: false, error: 'Conversation not found' });
    const history = await conversationHistory(ctx, id, 16);
    const result = await generateText([
      { role: 'system', content: 'صنّف المحادثة إلى مجلد قصير مناسب و0-4 وسوم عربية قصيرة. أعد JSON فقط: {"folder":"اسم أو null","tags":["وسم"]}. لا تضع معلومات حساسة في اسم المجلد.' },
      { role: 'user', content: `العنوان: ${conversation.title}\n\n${history.map((m: any) => `[${m.role}] ${m.content}`).join('\n').slice(0, 8000)}` },
    ], { maxTokens: 250, temperature: 0.2 });
    const json = parseJsonObject(result.content) || {};
    return res.json({ ok: true, suggested: { folder: typeof json.folder === 'string' && json.folder.trim() ? json.folder.trim().slice(0, 40) : null, tags: Array.isArray(json.tags) ? json.tags.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 4) : [] } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Categorization failed' });
  }
}
