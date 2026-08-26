import { authContext, buildCloudContext, generateText, parseJsonObject } from '../../serverless/cloud-ai';
export const config = { maxDuration: 30 };
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message required' });
    const context = await buildCloudContext(ctx, { message, mode: 'planning' });
    const system = `حوّل رسالة المستخدم إلى اقتراحات تنفيذ داخل تطبيق عيش آمن فقط عندما تكون هناك نية واضحة. الأنواع المسموحة: task, focus, goal, milestone, journal, exam, work_note, memory, safe_action. أعد JSON فقط: {"proposals":[{"type":"task","title":"...","reason":"...","data":{}}]}. بحد أقصى 3. إذا لا يوجد إجراء واضح أعد {"proposals":[]}. لا تخترع IDs.`;
    const result = await generateText([
      { role: 'system', content: system },
      { role: 'user', content: `الرسالة: ${message}\n\nسياق مساعد:\n${context.text.slice(0, 10000)}` },
    ], { maxTokens: 800, temperature: 0.2 });
    const json = parseJsonObject(result.content) || {};
    const allowed = new Set(['task','focus','goal','milestone','journal','exam','work_note','memory','safe_action']);
    const write = context.settings?.ai?.permissions?.write || {};
    const permissionKey: Record<string, string> = { task: 'tasks', focus: 'tasks', goal: 'goals', milestone: 'goals', journal: 'journal', exam: 'study', work_note: 'work_notes', memory: 'memories', safe_action: 'safe' };
    const proposals = (Array.isArray(json.proposals) ? json.proposals : [])
      .filter((p: any) => p && allowed.has(p.type) && p.title && write[permissionKey[p.type]] !== false)
      .slice(0, 3)
      .map((p: any) => ({ type: p.type, title: String(p.title), reason: p.reason ? String(p.reason) : undefined, data: p.data && typeof p.data === 'object' ? p.data : {} }));
    return res.json({ ok: true, proposals, model: result.model });
  } catch (error) {
    return res.json({ ok: false, proposals: [], error: error instanceof Error ? error.message : 'AI failed' });
  }
}
