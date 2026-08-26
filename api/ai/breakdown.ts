import { assertCloudAiAllowed, authContext, generateText } from '../../serverless/cloud-ai';
export const config = { maxDuration: 30 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    await assertCloudAiAllowed(ctx);
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await generateText([
      { role: 'system', content: 'قسّم المهمة إلى خطوات عملية صغيرة. أعد الخطوات فقط، كل خطوة في سطر مرقم، بحد أقصى 12 خطوة.' },
      { role: 'user', content: text },
    ], { maxTokens: 750, temperature: 0.25 });
    const steps = result.content.split('\n').map((x) => x.replace(/^\s*\d+[.)-]?\s*/, '').replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0, 12);
    return res.json({ ok: true, steps, fallback: false, model: result.model });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'AI failed' });
  }
}
