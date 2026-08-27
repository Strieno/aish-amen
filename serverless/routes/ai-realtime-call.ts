declare const process: { env: Record<string, string | undefined> };

import {
  assertCloudAiAllowed,
  assistantPrompt,
  authContext,
  buildCloudContext,
  conversationHistory,
  corsNoStore,
  loadAssistant,
  loadConversation,
} from '../cloud-ai';

export const config = { maxDuration: 60 };

const compact = (value: unknown, max = 12000) => String(value || '').trim().slice(0, max);

function publicRealtimeError(status: number, detail: string) {
  if (status === 401 || status === 403) return 'مفتاح OpenAI غير صحيح أو لا يملك صلاحية Realtime.';
  if (status === 429) return 'تم بلوغ حد استخدام OpenAI أو الرصيد. راجع الفوترة ثم أعد المحاولة.';
  if (status >= 500) return 'خدمة المحادثة الصوتية غير متاحة مؤقتًا. حاول بعد قليل.';
  return detail ? `OpenAI Realtime: ${detail.slice(0, 240)}` : `تعذر بدء المحادثة الصوتية (${status}).`;
}

export default async function handler(req: any, res: any) {
  corsNoStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ ok: false, error: 'سجّل الدخول أولًا لاستخدام المحادثة الصوتية.' });
    await assertCloudAiAllowed(ctx);
    const body = req.body || {};
    const sdp = compact(body.sdp, 100000);
    if (!sdp || !sdp.startsWith('v=0')) return res.status(400).json({ ok: false, error: 'عرض الاتصال الصوتي غير صالح.' });

    const apiKey = compact(process.env.OPENAI_API_KEY, 1000);
    if (!apiKey) return res.status(503).json({ ok: false, error: 'أضف OPENAI_API_KEY في إعدادات Vercel لتشغيل التكلم المباشر.' });
    const baseUrl = (compact(process.env.OPENAI_BASE_URL, 1000) || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = compact(process.env.OPENAI_REALTIME_MODEL, 100) || 'gpt-realtime-2.1-mini';
    const voice = compact(body.voice || process.env.OPENAI_REALTIME_VOICE, 40) || 'alloy';
    const language = body.language === 'en' ? 'en' : 'ar';
    const conversation = await loadConversation(ctx, compact(body.conversation_id, 200) || undefined);
    const assistant = await loadAssistant(ctx, compact(body.assistant_id, 200) || undefined);
    const context = await buildCloudContext(ctx, {
      message: language === 'en' ? 'Live voice conversation' : 'محادثة صوتية مباشرة',
      mode: compact(body.mode, 50) || 'general',
      conversation,
    });
    const history = await conversationHistory(ctx, conversation?.id, 14);
    const historyText = history.map((item: any) => `${item.role}: ${compact(item.content, 700)}`).join('\n');
    const instructions = [
      assistantPrompt(assistant, compact(body.mode, 50) || 'general'),
      'هذه محادثة صوتية مباشرة. أجب بصوت طبيعي ومختصر، ولا تستخدم Markdown أو قوائم طويلة. انتظر نهاية كلام المستخدم قبل الرد، وتوقف فورًا عندما يقاطعك.',
      language === 'en' ? 'Prefer English unless the user changes language.' : 'تحدث بالعربية الطبيعية ما لم يغيّر المستخدم اللغة.',
      context.text ? `سياق التطبيق:\n${context.text}` : '',
      historyText ? `آخر المحادثة الحالية:\n${historyText}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 24000);

    const session = {
      type: 'realtime',
      model,
      instructions,
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          transcription: { model: compact(process.env.OPENAI_TRANSCRIBE_MODEL, 100) || 'gpt-4o-mini-transcribe', language },
          turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true, eagerness: 'auto' },
        },
        output: { voice, speed: 1 },
      },
    };
    const form = new FormData();
    form.set('sdp', sdp);
    form.set('session', JSON.stringify(session));
    const upstream = await fetch(`${baseUrl}/realtime/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const answer = await upstream.text();
    if (!upstream.ok) {
      let detail = answer;
      try { detail = JSON.parse(answer)?.error?.message || answer; } catch { /* plain response */ }
      throw Object.assign(new Error(publicRealtimeError(upstream.status, detail)), { status: upstream.status });
    }
    return res.json({ ok: true, sdp: answer, model, voice });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر بدء المحادثة الصوتية.';
    const status = Number((error as any)?.status) || (/الخصوصية القصوى/.test(message) ? 403 : 502);
    return res.status(status).json({ ok: false, error: message });
  }
}
