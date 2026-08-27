import { authContext, assistantPrompt, buildCloudContext, generateText, selectedModel } from '../cloud-ai';
export const config = { maxDuration: 60 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!incoming.length) return res.status(400).json({ error: 'messages is required' });
    const lastUser = [...incoming].reverse().find((m: any) => m?.role === 'user');
    const text = String(lastUser?.content || '');
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    let system = assistantPrompt(null, 'general');
    const context = await buildCloudContext(ctx, { message: text, mode: 'general' });
    system += `

# سياق عيش آمن
${context.text}`;
    const result = await generateText([{ role: 'system', content: system }, ...incoming.slice(-20)], { model: selectedModel(req.body?.model), maxTokens: 2200 });
    return res.status(200).json({ id: `aish-${Date.now()}`, object: 'chat.completion', model: result.model, choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }] });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'AI request failed' });
  }
}
