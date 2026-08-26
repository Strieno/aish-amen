const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const REQUEST_WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 20;
const usageWindows = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function pathFromRequest(req) {
  return new URL(req.url || '/', 'https://aish-aman.local').pathname.replace(/^\/api\/?/, '');
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  const forwarded = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try {
    return new URL(origin).host === forwarded;
  } catch {
    return false;
  }
}

async function authenticatedUser(req) {
  const token = bearerToken(req);
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
  if (!token || !supabaseUrl || !publishableKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function rateLimited(userId) {
  const now = Date.now();
  const current = usageWindows.get(userId);
  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    usageWindows.set(userId, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > REQUESTS_PER_WINDOW;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string' || !req.body) return {};
  try { return JSON.parse(req.body); } catch { return {}; }
}

function cleanHistory(input) {
  if (!Array.isArray(input)) return [];
  let chars = 0;
  const rows = [];
  for (const item of input.slice(-12)) {
    if (!item || !['user', 'assistant'].includes(item.role)) continue;
    const content = String(item.content || '').trim().slice(0, 4_000);
    if (!content) continue;
    chars += content.length;
    if (chars > 12_000) break;
    rows.push({ role: item.role, content });
  }
  return rows;
}

function assistantInstructions(page, mode) {
  const pageNames = {
    today: 'اليوم', chat: 'المحادثة', safe: 'العيش الآمن', tasks: 'المهام', study: 'الدراسة',
    work: 'العمل', journal: 'اليوميات', goals: 'الأهداف', gratitude: 'الامتنان', memory: 'الذاكرة',
    knowledge: 'المعرفة', audio: 'الصوت', focus: 'التركيز', insights: 'الإحصاءات', settings: 'الإعدادات',
  };
  return [
    'أنت المساعد الشخصي داخل تطبيق «عِش آمن».',
    'أجب بلغة المستخدم وبأسلوب هادئ، واضح، عملي، ومختصر ما لم يطلب المستخدم التفصيل.',
    'لا تدّعِ أنك قرأت بيانات غير موجودة في الرسائل. لا تنفّذ تغييرات في التطبيق؛ اقترح الخطوات فقط.',
    'عند وجود خطر مباشر أو حالة طبية طارئة، شجّع المستخدم على التواصل فورًا مع خدمات الطوارئ أو شخص موثوق قريب.',
    `السياق الحالي: صفحة ${pageNames[page] || page || 'التطبيق'}، والوضع ${mode || 'عام'}.`,
  ].join('\n');
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function openAIError(response) {
  const body = await response.json().catch(() => null);
  const message = String(body?.error?.message || 'تعذر الاتصال بخدمة OpenAI.');
  if (response.status === 401) return 'مفتاح OpenAI غير صحيح أو لم يعد صالحًا.';
  if (response.status === 429) return 'تم تجاوز رصيد أو حد استخدام OpenAI. راجع الفوترة وحدود المشروع.';
  return message.slice(0, 300);
}

async function streamResponse(req, res, body) {
  const content = String(body.content || body.message || '').trim().slice(0, 6_000);
  if (!content) return json(res, 400, { error: 'الرسالة مطلوبة.' });

  const openAIKey = String(process.env.OPENAI_API_KEY || '');
  if (!openAIKey) return json(res, 503, { error: 'أضف OPENAI_API_KEY في Vercel ثم أعد النشر.' });

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const model = String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim();
  const history = cleanHistory(body.history);
  const conversationId = String(body.conversation_id || `conv-${crypto.randomUUID()}`);

  let upstream;
  try {
    upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAIKey}` },
      body: JSON.stringify({
        model,
        instructions: assistantInstructions(String(body.page || 'chat'), String(body.mode || 'general')),
        input: [...history, { role: 'user', content }],
        max_output_tokens: 1_200,
        store: false,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    return json(res, 502, { error: error instanceof Error ? error.message : 'تعذر الاتصال بخدمة OpenAI.' });
  }

  if (!upstream.ok || !upstream.body) return json(res, 502, { error: await openAIError(upstream) });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  sse(res, 'start', { conversation_id: conversationId, model, provider: 'openai-cloud' });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let streamError = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          let event;
          try { event = JSON.parse(raw); } catch { continue; }
          if (event.type === 'response.output_text.delta' && event.delta) {
            full += event.delta;
            sse(res, 'delta', { delta: event.delta });
          }
          if (event.type === 'response.failed') streamError = String(event.response?.error?.message || 'تعذر إكمال رد OpenAI.');
          if (event.type === 'error') streamError = String(event.message || 'تعذر إكمال رد OpenAI.');
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) streamError = error instanceof Error ? error.message : 'انقطع اتصال OpenAI.';
  } finally {
    reader.cancel().catch(() => {});
  }

  if (controller.signal.aborted) return;
  if (streamError && !full) sse(res, 'error', { message: streamError.slice(0, 300) });
  else sse(res, 'done', { content: full, partial: Boolean(streamError), model, provider: 'openai-cloud' });
  res.end();
}

module.exports = async function handler(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'الطلب غير مسموح من هذا الموقع.' });

  let user;
  try { user = await authenticatedUser(req); } catch { return json(res, 503, { error: 'تعذر التحقق من حساب Supabase.' }); }
  if (!user) return json(res, 401, { error: 'سجّل الدخول أولًا.' });
  if (rateLimited(user.id)) return json(res, 429, { error: 'طلبات كثيرة جدًا. انتظر دقيقة ثم حاول مجددًا.' });

  const path = pathFromRequest(req);
  if (req.method === 'GET' && path === 'ai/status') {
    const configured = Boolean(process.env.OPENAI_API_KEY);
    return json(res, 200, {
      providers: [{ id: 'openai-cloud', name: 'OpenAI', status: configured ? 'connected' : 'error', modelCount: configured ? 1 : 0 }],
      defaultModel: String(process.env.OPENAI_MODEL || 'gpt-5-mini'),
    });
  }

  if (req.method === 'POST' && (path === 'chat/stream' || path === 'ai/assist/stream')) {
    return streamResponse(req, res, parseBody(req));
  }
  return json(res, 404, { error: 'المسار غير موجود.' });
};
