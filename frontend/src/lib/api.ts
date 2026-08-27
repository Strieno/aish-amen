// Typed API client. In cloud mode, supported CRUD routes use Supabase directly;
// local/AI routes keep using the trusted backend.
import { apiBaseUrl, cloudConfigured, supabase, supabasePublishableKey, supabaseUrl } from '../cloud/client';
import { tryCloudRequest } from '../cloud/bridge';

const BASE = apiBaseUrl;

const cloudHeaders = cloudConfigured ? {
  'X-Supabase-Url': supabaseUrl,
  'X-Supabase-Key': supabasePublishableKey,
} : {};


function trustedBase() {
  // In the deployed cloud app, trusted AI traffic must stay on the same Vercel origin.
  // This prevents an old/local VITE_API_BASE_URL from sending authenticated requests
  // to localhost or another backend when the user opens the hosted app.
  if (cloudConfigured && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return '/api';
  }
  return BASE;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  let cloudBody: unknown;
  if (typeof options.body === 'string' && options.body) {
    try { cloudBody = JSON.parse(options.body); } catch { cloudBody = undefined; }
  }
  const cloud = await tryCloudRequest(path, method, cloudBody);
  if (cloud.handled) return cloud.data as T;

  const token = cloudConfigured ? (await supabase?.auth.getSession())?.data.session?.access_token : null;
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(cloudHeaders)) headers.set(name, value);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(trustedBase() + path, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error || body.message || msg;
    } catch { /* keep default */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function body(method: string, data: unknown) {
  return {
    method,
    body: JSON.stringify(data),
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, body('POST', data)),
  postAbortable: <T>(path: string, data: unknown, signal: AbortSignal) => request<T>(path, { ...body('POST', data), signal }),
  put: <T>(path: string, data?: unknown) => request<T>(path, body('PUT', data)),
  patch: <T>(path: string, data?: unknown) => request<T>(path, body('PATCH', data)),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * Fetch + parse an SSE stream from the chat endpoint.
 * Calls onDelta for each text chunk and resolves when the stream finishes.
 */
export async function streamChat(
  payload: { content: string; conversation_id?: string; assistant_id?: string; model?: string; provider_id?: string; page?: string; mode?: string; regenerate?: boolean; history?: { role: 'user' | 'assistant'; content: string }[] },
  handlers: {
    onStart?: (info: { conversation_id: string; model: string; provider: string }) => void;
    onDelta: (delta: string) => void;
    onDone: (info: { content: string; partial: boolean; warning?: string; model?: string; provider?: string; contextUsed?: unknown; generationMs?: number }) => void;
    onError: (message: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const isAssist = !!payload.page;
  const requestPayload = isAssist
    ? { ...payload, message: payload.content }
    : payload;
  const token = cloudConfigured ? (await supabase?.auth.getSession())?.data.session?.access_token : null;
  const base = trustedBase();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const [name, value] of Object.entries(cloudHeaders)) headers.set(name, value);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(isAssist ? base + '/ai/assist/stream' : base + '/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestPayload),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    let message = `تعذر الاتصال بالمساعد (HTTP ${res.status}).`;
    try {
      const text = await res.text();
      const parsed = JSON.parse(text);
      message = String(parsed?.error || parsed?.message || message);
    } catch { /* keep the friendly fallback */ }
    handlers.onError(message);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let terminalEvent = false;
  const consume = (events: string[]) => {
    for (const ev of events) {
      const lines = ev.split(/\r?\n/);
      const evName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
      const dataLine = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      let data: Record<string, unknown> = {};
      try {
        data = dataLine ? JSON.parse(dataLine) : {};
      } catch { /* ignore */ }
      if (evName === 'start') {
        handlers.onStart?.(data as { conversation_id: string; model: string; provider: string });
      } else if (evName === 'delta') {
        handlers.onDelta(String(data.delta || ''));
      } else if (evName === 'done') {
        terminalEvent = true;
        handlers.onDone({
          content: String(data.content || ''),
          partial: !!data.partial,
          warning: data.warning ? String(data.warning) : undefined,
          model: data.model ? String(data.model) : undefined,
          provider: data.provider ? String(data.provider) : undefined,
          contextUsed: data.contextUsed,
          generationMs: data.generationMs as number,
        });
      } else if (evName === 'error') {
        terminalEvent = true;
        handlers.onError(String(data.message || 'خطأ غير معروف'));
      }
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const events = buf.split('\n\n');
      buf = events.pop() || '';
      consume(events);
    }
    buf += decoder.decode().replace(/\r\n/g, '\n');
    if (buf.trim()) consume([buf]);
    if (!terminalEvent && !handlers.signal?.aborted) {
      handlers.onError('انقطع الاتصال قبل اكتمال الرد. يمكنك إعادة المحاولة دون فقدان رسالتك.');
    }
  } finally {
    reader.releaseLock();
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
