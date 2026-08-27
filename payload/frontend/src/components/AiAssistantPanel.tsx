import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, Send, Sparkles, Square, X } from 'lucide-react';
import { api, streamChat } from '../lib/api';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import Markdown from './Markdown';
import { Spinner } from './ui';

type AiStatus = 'checking' | 'online' | 'offline';

function pageFromPath(path: string): string {
  const map: Record<string, string> = {
    '/': 'today',
    '/chat': 'chat',
    '/safe': 'safe',
    '/tasks': 'tasks',
    '/study': 'study',
    '/work': 'work',
    '/journal': 'journal',
    '/goals': 'goals',
    '/gratitude': 'gratitude',
    '/memory': 'memory',
    '/knowledge': 'knowledge',
    '/audio': 'audio',
    '/focus': 'focus',
    '/insights': 'insights',
    '/settings': 'settings',
  };
  return map[path] || 'today';
}

/**
 * Global floating AI assistant: available on every page, streams from the
 * local model with page-aware context, and degrades gracefully offline.
 */
export default function AiAssistantPanel() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState('today');
  const [status, setStatus] = useState<AiStatus>('checking');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(pageFromPath(location.pathname));
    if (location.pathname === '/chat') setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (open) checkStatus();
  }, [open, page]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, streamText, sending]);

  const checkStatus = async () => {
    setStatus('checking');
    try {
      const r = await api.get<{ providers: { status: string }[] }>('/ai/status');
      const ok = r.providers.some((p) => p.status === 'connected');
      setStatus(ok ? 'online' : 'offline');
    } catch {
      setStatus('offline');
    }
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setStreamText('');
    setHistory((h) => [...h, { role: 'user', content: text }]);
    abortRef.current = new AbortController();

    let acc = '';
    try {
      await streamChat(
        { content: text, page, assistant_id: undefined, history: history.slice(-12) },
        {
          onDelta: (d) => {
            acc += d;
            setStreamText(acc);
          },
          onDone: () => {
            setStreamText('');
            setHistory((h) => [...h, { role: 'assistant', content: acc }]);
          },
          onError: (msg) => {
            setStreamText('');
            setHistory((h) => [...h, { role: 'assistant', content: `**${msg}**` }]);
          },
          signal: abortRef.current.signal,
        },
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        const message = error instanceof Error ? error.message : 'تعذر الاتصال بالمساعد';
        setHistory((h) => [...h, { role: 'assistant', content: `**${message}**` }]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setSending(false);
    setStreamText('');
  };

  const suggestions = [1, 2, 3]
    .map((i) => t(`ai.sugg.${page}${i}`))
    .filter((s) => !s.startsWith('ai.sugg'));

  const statusDot =
    status === 'online' ? 'bg-brand-accent' : status === 'offline' ? 'bg-danger' : 'bg-warn';

  return (
    <>
      {/* Floating button */}
      {location.pathname !== '/chat' && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-20 start-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-button transition hover:bg-brand-dark active:scale-95 lg:bottom-6 lg:end-6 lg:start-auto"
          aria-label={t('ai.askAssistant')}
          title={t('ai.askAssistant')}
          aria-expanded={open}
          aria-controls="global-ai-assistant"
        >
          {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          <span className={`absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${statusDot}`} />
        </button>
      )}

      {/* Panel */}
      {open && location.pathname !== '/chat' && (
        <div
          id="global-ai-assistant"
          role="dialog"
          aria-label={t('ai.title')}
          className="fixed bottom-40 start-4 z-40 flex h-[min(560px,calc(100dvh-11rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card-hover animate-fadeIn lg:bottom-24 lg:end-6 lg:start-auto lg:h-[min(560px,80vh)]"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-line bg-brand-soft px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{t('ai.title')}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                {status === 'online' ? t('ai.online') : status === 'offline' ? t('ai.offline') : t('ai.checking')}
                <span className="ms-1">• {t(`ai.page.${page}`)}</span>
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="btn-icon !h-7 !w-7" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Suggestions */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={sending}
                className="shrink-0 rounded-pill bg-elevated px-3 py-1 text-xs font-semibold text-ink-soft transition hover:bg-brand-soft hover:text-brand-dark"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {history.length === 0 && !sending && (
              <div className="pt-6 text-center">
                <Sparkles className="mx-auto mb-2 h-6 w-6 text-brand-dark" />
                <p className="text-sm font-bold text-ink">{t('ai.title')}</p>
                <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-ink-faint">
                  {lang === 'ar'
                    ? 'أنا معك في كل صفحة — اسألني عن مهامك، دراستك، يومك، أو أي شيء يقلقك.'
                    : 'I am with you on every page — ask me about your tasks, study, day, or anything on your mind.'}
                </p>
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-be-md bg-brand-soft text-ink'
                      : 'rounded-bs-md border border-line bg-elevated text-ink'
                  }`}
                >
                  {m.role === 'assistant' ? <Markdown content={m.content} /> : <span className="whitespace-pre-line">{m.content}</span>}
                </div>
              </div>
            ))}
            {sending && !streamText && (
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <Spinner className="h-3.5 w-3.5" /> {t('ai.thinking')}
              </div>
            )}
            {sending && streamText && (
              <div className="max-w-[90%] rounded-2xl rounded-bs-md border border-line bg-elevated px-3.5 py-2.5">
                <Markdown content={streamText} />
              </div>
            )}
            {!sending && status === 'offline' && (
              <div className="rounded-xl border border-warn-border bg-warn-bg p-3 text-xs text-warn">
                <p className="font-bold">{t('ai.noModel')}</p>
                <p className="mt-1">{t('ai.noModelHint')}</p>
                <Link to="/settings" className="mt-2 inline-block font-bold underline" onClick={() => setOpen(false)}>
                  {t('ai.setup')}
                </Link>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-line p-3">
            <textarea
              className="input max-h-28 min-h-[42px] flex-1 resize-y !py-2 text-sm"
              placeholder={t('ai.ask')}
              aria-label={t('ai.ask')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send();
              }}
            />
            {sending ? (
              <button onClick={stop} className="btn-danger !p-2.5" title={t('ai.stop')} aria-label={t('ai.stop')}>
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={() => send()} className="btn-primary !p-2.5" disabled={!input.trim()} title={t('ai.ask')} aria-label={t('ai.ask')}>
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
