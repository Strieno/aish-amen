import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import { matchCommand } from '../lib/commands';
import { localDateKey } from '../lib/date';
import AiResultBox from './AiResultBox';
import { Spinner } from './ui';

/**
 * Persistent compact command input — "What do you want to do?".
 * Understands natural commands locally (plan, focus, urgent, add task…)
 * and falls back to the AI `interpret` action for everything else.
 * Also executes commands sent from the global command palette.
 */
export default function CommandBar({
  urgentOnly,
  onUrgentOnly,
  onCalm,
}: {
  urgentOnly: boolean;
  onUrgentOnly: (v: boolean) => void;
  onCalm: (v: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const theme = useAppStore((s) => s.settings.theme);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const statusTimer = useRef<number | null>(null);

  const flash = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setAnswer(null);
    setStatus({ tone, text });
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 4000);
  };

  useEffect(() => () => {
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
  }, []);

  const run = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setValue('');
    setAnswer(null);
    const m = matchCommand(text);

    try {
      switch (m.kind) {
        case 'plan': {
          setBusy(true);
          setStatus({ tone: 'ok', text: t('cmd.planRunning') });
          const r = await api.post<{ text?: string; answer?: string }>('/ai/action', { action: 'plan-day' });
          setAnswer(r.text || r.answer || null);
          setStatus(null);
          break;
        }
        case 'next': {
          setBusy(true);
          setStatus({ tone: 'ok', text: t('cmd.nextRunning') });
          const r = await api.post<{ text?: string; answer?: string }>('/ai/action', { action: 'next-task' });
          setAnswer(r.text || r.answer || null);
          setStatus(null);
          break;
        }
        case 'calm':
          onCalm(true);
          flash(t('cmd.calmOn'));
          break;
        case 'urgent':
          onUrgentOnly(true);
          flash(t('cmd.urgentOn'));
          break;
        case 'focus':
          navigate('/focus');
          break;
        case 'theme': {
          const dark = document.documentElement.classList.contains('dark');
          setThemeMode(dark ? 'light' : 'dark');
          flash(dark ? t('cmd.themeLight') : t('cmd.themeDark'));
          break;
        }
        case 'task-add': {
          await api.post('/tasks', { title: m.payload || text, priority: 'medium', energy: 'medium', status: 'inbox', due_date: null });
          flash(t('cmd.doneTask'));
          break;
        }
        case 'note-add': {
          await api.post('/journal', {
            title: (m.payload || text).slice(0, 50),
            content: m.payload || text,
            entry_date: localDateKey(),
            tags: [],
            mood: null,
            ai_access: true,
          });
          flash(t('cmd.doneNote'));
          break;
        }
        case 'gratitude-add': {
          await api.post('/gratitude', { items: [(m.payload || text).slice(0, 200)] });
          flash(t('cmd.doneGratitude'));
          break;
        }
        case 'exam-add': {
          const title = (m.payload || text).replace(/^(امتحان|اختبار)\s*[:\-]?\s*/i, '').trim() || 'امتحان جديد';
          await api.post('/exams', { title, exam_date: null });
          flash(t('cmd.doneExam'));
          break;
        }
        case 'chat':
          navigate(`/chat?q=${encodeURIComponent(text)}`);
          break;
        case 'interpret':
        default: {
          setBusy(true);
          setStatus({ tone: 'ok', text: t('cmd.thinking') });
          const r = await api.post<{
            ok?: boolean;
            kind?: string;
            suggestion?: { title?: string; content?: string; items?: string[]; due?: string | null; priority?: string; energy?: string };
            answer?: string;
            text?: string;
            error?: string;
          }>('/ai/action', { action: 'interpret', text });
          if (!r.ok && r.error) throw new Error(r.error);
          if (r.kind === 'task' && r.suggestion?.title) {
            await api.post('/tasks', { title: r.suggestion.title, priority: r.suggestion.priority || 'medium', energy: r.suggestion.energy || 'medium', status: 'inbox', due_date: r.suggestion.due || null });
            flash(t('cmd.doneTask'));
          } else if (r.kind === 'journal') {
            await api.post('/journal', {
              title: (r.suggestion?.title || text).slice(0, 50),
              content: r.suggestion?.content || text,
              entry_date: localDateKey(),
              tags: [],
              mood: null,
              ai_access: true,
            });
            flash(t('cmd.doneNote'));
          } else if (r.kind === 'gratitude') {
            await api.post('/gratitude', { items: r.suggestion?.items || [text] });
            flash(t('cmd.doneGratitude'));
          } else if (r.answer || r.text) {
            setStatus(null);
            setAnswer(r.answer || r.text || null);
          } else {
            setStatus(null);
            navigate(`/chat?q=${encodeURIComponent(text)}`);
          }
          break;
        }
      }
    } catch {
      flash(t('cmd.failed'), 'warn');
    } finally {
      setBusy(false);
    }
  };

  // Commands dispatched from the global palette ("aish:run-command").
  useEffect(() => {
    const onRun = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (text) void run(text);
    };
    window.addEventListener('aish:run-command', onRun);
    return () => window.removeEventListener('aish:run-command', onRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgentOnly, theme]);

  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 shadow-card transition focus-within:border-brand-lighter">
        <Sparkles className="h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint"
          placeholder={t('cmd.placeholder')}
          aria-label={t('cmd.placeholder')}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void run(value);
          }}
        />
        {busy ? (
          <Spinner className="h-3.5 w-3.5 shrink-0" />
        ) : value ? (
          <button type="button" onClick={() => void run(value)} className="btn-icon !h-6 !w-6" aria-label={t('common.confirm')}>
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="hidden shrink-0 rounded border border-line px-1 text-[10px] font-semibold text-ink-faint sm:inline">Enter</span>
        )}
        {urgentOnly && (
          <button type="button" onClick={() => onUrgentOnly(false)} className="chip !px-2 !text-[10px]" aria-label={t('dash.showAll')}>
            {t('dash.urgentOnly')} <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {status && (
        <p className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold ${status.tone === 'warn' ? 'text-warn' : 'text-ok'}`} role="status">
          {status.text}
        </p>
      )}
      {answer && (
        <div className="mt-1.5">
          <AiResultBox loading={false} result={{ ok: true, text: answer }} compact />
        </div>
      )}
    </div>
  );
}
