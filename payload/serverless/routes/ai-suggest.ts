import { authContext, buildCloudContext, generateText } from '../cloud-ai';
export const config = { maxDuration: 30 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    const context = await buildCloudContext(ctx, { message: 'ملخص يومي ذكي وأهم خطوة قادمة', mode: 'planning', page: 'today' });
    const result = await generateText([
      { role: 'system', content: 'اكتب رؤية ذكية واحدة مترابطة من 2-3 جمل تربط أهم بيانات اليوم وتذكر خطوة تالية واقعية. لا تختلق شيئًا.' },
      { role: 'user', content: context.text },
    ], { maxTokens: 350, temperature: 0.4 });
    return res.json({ ok: true, suggestion: result.content, fallback: false, model: result.model });
  } catch (error) {
    return res.json({ ok: true, suggestion: '', fallback: true, error: error instanceof Error ? error.message : 'AI failed' });
  }
}
