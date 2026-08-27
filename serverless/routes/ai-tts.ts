import { assertCloudAiAllowed, authContext, corsNoStore, generateSpeech } from '../cloud-ai';

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  corsNoStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ ok: false, error: 'سجّل الدخول أولًا لاستخدام القراءة الصوتية.' });
    await assertCloudAiAllowed(ctx);

    const body = req.body || {};
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    if (!text) return res.status(400).json({ ok: false, error: 'لا يوجد نص لقراءته.' });

    const speech = await generateSpeech(text, {
      model: body.model,
      voice: body.voice || 'alloy',
      speed: body.speed,
    });
    return res.json({ ok: true, ...speech });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر توليد الصوت.';
    const privacy = /الخصوصية القصوى/.test(message);
    return res.status(privacy ? 403 : 502).json({ ok: false, error: message });
  }
}
