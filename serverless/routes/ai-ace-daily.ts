import { assertCloudAiAllowed, authContext, buildCloudAcePacket } from '../cloud-ai';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ ok: false, error: 'سجّل الدخول أولًا.' });
    await assertCloudAiAllowed(ctx);

    const packet = await buildCloudAcePacket(ctx, { message: '', mode: 'planning' });
    return res.json({
      ok: true,
      summary: {
        intent: packet.intent,
        topTask: packet.importantTasks?.[0]?.text || null,
        topGoal: packet.activeGoals?.[0]?.text || null,
        focusMinutes: packet.recentEvents?.find((e) => e.source === 'focus')?.text || null,
        risks: packet.risks.map((r) => r.label),
      },
      packet: { intent: packet.intent, metadata: packet.metadata },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر بناء ملخص اليوم.';
    const privacy = /الخصوصية القصوى/.test(message);
    return res.status(privacy ? 403 : 502).json({ ok: false, error: message });
  }
}
