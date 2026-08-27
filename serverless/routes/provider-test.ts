import { assertCloudAiAllowed, authContext, cloudProviderCatalog, generateText, resolveCloudSelection } from '../cloud-ai';
export const config = { maxDuration: 20 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let ctx;
  try { ctx = await authContext(req); }
  catch { return res.status(503).json({ ok: false, message: 'تعذر التحقق من جلسة Supabase. حاول مرة أخرى.' }); }
  if (!ctx) return res.status(401).json({ error: 'Authentication required' });
  try { await assertCloudAiAllowed(ctx); } catch (error) { return res.json({ ok: false, message: error instanceof Error ? error.message : 'Cloud AI blocked' }); }
  const requestedId = String(req.query?.id || '');
  const configured = cloudProviderCatalog().find((provider) => provider.id === requestedId);
  if (!configured) return res.status(404).json({ ok: false, message: 'مزود الذكاء الاصطناعي غير متاح في الوضع السحابي.' });
  if (!configured.configured) return res.json({ ok: false, message: `أضف ${configured.keyName} في Vercel ثم أعد النشر.` });
  try {
    const selection = resolveCloudSelection(requestedId);
    const result = await generateText([
      { role: 'system', content: 'هذا اختبار اتصال. أجب بكلمة واحدة فقط: متصل' },
      { role: 'user', content: 'اختبار' },
    ], { providerId: requestedId, model: selection.model, maxTokens: 20, temperature: 0, timeoutMs: 20000 });
    return res.json({ ok: Boolean(result.content), message: `متصل فعليًا عبر ${configured.name}`, model: result.model, modelCount: configured.models.length });
  } catch (error) {
    return res.json({ ok: false, message: error instanceof Error ? error.message : 'Connection failed' });
  }
}
