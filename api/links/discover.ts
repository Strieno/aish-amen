import { authContext, buildCloudContext, generateText, parseJsonObject, sbInsert, sbSelect, uid } from '../../serverless/cloud-ai';
export const config = { maxDuration: 30 };

const TABLES: Record<string, { table: string; title: string }> = {
  task: { table: 'tasks', title: 'title' }, goal: { table: 'goals', title: 'title' }, memory: { table: 'memories', title: 'content' },
  course: { table: 'courses', title: 'name' }, exam: { table: 'exams', title: 'title' }, journal: { table: 'journal_entries', title: 'title' },
  work_note: { table: 'work_notes', title: 'title' }, safe_living_plan: { table: 'safe_living_plans', title: 'name' }, conversation: { table: 'conversations', title: 'title' },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });
    const type = String(req.body?.type || '');
    const id = String(req.body?.id || '');
    const spec = TABLES[type];
    if (!spec || !id) return res.status(400).json({ error: 'type and id required' });
    const source = (await sbSelect(ctx, spec.table, { id: `eq.${id}`, limit: 1 }))[0];
    if (!source) return res.status(404).json({ error: 'entity not found' });
    const title = String(source[spec.title] || id);
    const context = await buildCloudContext(ctx, { message: title, mode: 'planning' });
    const candidates: any[] = [];
    const push = (rows: any[], t: string, field: string) => rows.slice(0, 8).forEach((row) => {
      if (!(t === type && String(row.id) === id)) candidates.push({ type: t, id: String(row.id), title: String(row[field] || row.id).slice(0, 120) });
    });
    push(context.data.tasks || [], 'task', 'title'); push(context.data.goals || [], 'goal', 'title'); push(context.data.memories || [], 'memory', 'content');
    push(context.data.courses || [], 'course', 'name'); push(context.data.exams || [], 'exam', 'title'); push(context.data.workNotes || [], 'work_note', 'title'); push(context.data.safePlans || [], 'safe_living_plan', 'name');
    const result = await generateText([
      { role: 'system', content: 'اختر حتى 3 روابط مفيدة فقط من قائمة المرشحين. استخدم IDs كما هي حرفيًا. أعد JSON فقط: {"links":[{"type":"task","id":"...","relationship_type":"related_to","reason":"سبب قصير","confidence":0.7}]}. إذا لا توجد علاقة واضحة أعد links فارغة.' },
      { role: 'user', content: `الكيان: [${type}] ${title}\nالمرشحون:\n${JSON.stringify(candidates.slice(0, 40))}` },
    ], { maxTokens: 550, temperature: 0.15 });
    const json = parseJsonObject(result.content) || {};
    const byKey = new Map(candidates.map((c) => [`${c.type}:${c.id}`, c]));
    const created = [];
    for (const link of (Array.isArray(json.links) ? json.links : []).slice(0, 3)) {
      const target = byKey.get(`${link.type}:${link.id}`);
      if (!target) continue;
      const row = await sbInsert(ctx, 'link_suggestions', {
        id: uid('ls-'), source_type: type, source_id: id, target_type: target.type, target_id: target.id,
        relationship_type: String(link.relationship_type || 'related_to'), confidence: Math.max(0, Math.min(1, Number(link.confidence) || 0.6)),
        reason: String(link.reason || '').slice(0, 240), status: 'pending',
      });
      created.push(row);
    }
    return res.json({ ok: true, suggestions: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Discovery failed' });
  }
}
