import { DEEPSEEK_PROVIDER_ID, assertCloudAiAllowed, authContext, deepSeekConfigured, generateText } from '../../../serverless/cloud-ai';
export const config = { maxDuration: 20 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await authContext(req);
  if (!ctx) return res.status(401).json({ error: 'Authentication required' });
  try { await assertCloudAiAllowed(ctx); } catch (error) { return res.json({ ok: false, message: error instanceof Error ? error.message : 'Cloud AI blocked' }); }
  if (String(req.query?.id || '') !== DEEPSEEK_PROVIDER_ID) return res.status(404).json({ ok: false, message: 'Provider not available in cloud mode' });
  if (!deepSeekConfigured()) return res.json({ ok: false, message: 'DEEPSEEK_API_KEY غير موجود في Vercel' });
  try {
    const result = await generateText([{ role: 'user', content: 'Reply only with OK' }], { maxTokens: 10, temperature: 0 });
    return res.json({ ok: Boolean(result.content), message: 'DeepSeek Cloud متصل', modelCount: 2 });
  } catch (error) {
    return res.json({ ok: false, message: error instanceof Error ? error.message : 'Connection failed' });
  }
}
