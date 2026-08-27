import { assertCloudAiAllowed, authContext, buildCloudAcePacket, cloudSerializePacket } from '../cloud-ai';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ ok: false, error: 'سجّل الدخول أولًا.' });
    const settings = await assertCloudAiAllowed(ctx);

    const body = req.body || {};
    const message = String(body.message || '').trim().slice(0, 2000);
    if (!message) return res.status(400).json({ ok: false, error: 'لا يوجد سؤال.' });

    const packet = await buildCloudAcePacket(ctx, { message, mode: body.mode || 'general' });
    const debug = body.debug === true || body.debug === 'true';
    return res.json({
      ok: true,
      packet,
      text: cloudSerializePacket(packet),
      debug: debug ? `ACE DEBUG\nIntent: ${packet.intent}\nCandidates: ${packet.metadata.candidateCount}\nSelected: ${packet.metadata.selectedCount}\nEstimated tokens: ${packet.metadata.estimatedTokens}` : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر بناء السياق.';
    const privacy = /الخصوصية القصوى/.test(message);
    return res.status(privacy ? 403 : 502).json({ ok: false, error: message });
  }
}
