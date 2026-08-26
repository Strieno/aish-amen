// Typed API client. In cloud mode, supported CRUD routes use Supabase directly;
// local/AI routes keep using the trusted backend.
import { apiBaseUrl, cloudConfigured, supabase } from '../cloud/client';
import { tryCloudRequest } from '../cloud/bridge';

const BASE = apiBaseUrl;

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
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    ...options,
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
  put: <T>(path: string, data?: unknown) => request<T>(path, body('PUT', data)),
  patch: <T>(path: string, data?: unknown) => request<T>(path, body('PATCH', data)),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * Fetch + parse an SSE stream from the chat endpoint.
 * Calls onDelta for each text chunk and resolves when the stream finishes.
 */
export async function streamChat(
  payload: { content: string; conversation_id?: string; assistant_id?: string; model?: string; provider_id?: string; page?: string; mode?: string },
  handlers: {
    onStart?: (info: { conversation_id: string; model: string; provider: string }) => void;
    onDelta: (delta: string) => void;
    onDone: (info: { content: string; partial: boolean; contextUsed?: unknown; generationMs?: number }) => void;
    onError: (message: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const isAssist = !!payload.page;
  const requestPayload = isAssist
    ? { ...payload, message: payload.content }
    : payload;
  const token = cloudConfigured ? (await supabase?.auth.getSession())?.data.session?.access_token : null;
  const res = await fetch(isAssist ? BASE + '/ai/assist/stream' : BASE + '/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(requestPayload),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    handlers.onError(text || `HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() || '';
    for (const ev of events) {
      const lines = ev.split('\n');
      const evName = lines[0].replace('event: ', '').trim();
      const dataLine = lines.find((l) => l.startsWith('data: '))?.slice(6) || '';
      let data: Record<string, unknown> = {};
      try {
        data = dataLine ? JSON.parse(dataLine) : {};
      } catch { /* ignore */ }
      if (evName === 'start') {
        handlers.onStart?.(data as { conversation_id: string; model: string; provider: string });
      } else if (evName === 'delta') {
        handlers.onDelta(String(data.delta || ''));
      } else if (evName === 'done') {
        handlers.onDone({ content: String(data.content || ''), partial: !!data.partial, contextUsed: data.contextUsed, generationMs: data.generationMs as number });
      } else if (evName === 'error') {
        handlers.onError(String(data.message || 'خطأ غير معروف'));
      }
    }
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
