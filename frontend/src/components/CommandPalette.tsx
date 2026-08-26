import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Heart, ListTodo, Sparkles, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { NAV_ITEMS } from '../lib/nav';
import { useT } from '../lib/i18n';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import type { SearchResults } from '../lib/types';

interface QuickCommand {
  id: string;
  label: string;
  icon: React.ElementType;
  run: () => void;
}

/**
 * Ctrl+K command palette: universal search across every module plus
 * quick-create commands. Results are grouped by type and navigable.
 */
export default function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener('aish:open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('aish:open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = window.setTimeout(() => {
      api
        .get<SearchResults>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r))
        .catch(() => setResults(null))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q, open]);

  const quickCommands = useMemo<QuickCommand[]>(
    () => [
      { id: 'new-task', label: `${t('tasks.add')}`, icon: ListTodo, run: () => { navigate('/tasks?new=1'); setOpen(false); } },
      { id: 'new-journal', label: `${t('journal.newEntry')}`, icon: BookOpen, run: () => { navigate('/journal?new=1'); setOpen(false); } },
      { id: 'new-checkin', label: `${t('today.checkin')}`, icon: Heart, run: () => { navigate('/safe'); setOpen(false); } },
      { id: 'focus', label: `${t('focus.start')}`, icon: Timer, run: () => { navigate('/focus'); setOpen(false); } },
      { id: 'ask-ai', label: `${t('ai.askAssistant')}`, icon: Sparkles, run: () => { navigate('/chat'); setOpen(false); } },
      ...NAV_ITEMS.map((item) => ({
        id: `nav-${item.id}`,
        label: t(item.labelKey),
        icon: item.icon,
        run: () => { navigate(item.path); setOpen(false); },
      })),
    ],
    [t, navigate],
  );

  const filteredCommands = q ? quickCommands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : quickCommands.slice(0, 6);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="card relative z-10 w-full max-w-xl animate-fadeIn bg-card p-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder')}
          className="input border-none !shadow-none focus:ring-0"
        />
        <div className="mt-2 max-h-[60vh] overflow-y-auto">
          {/* Quick commands */}
          {!searching && (!results || results.total === 0) && filteredCommands.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1 text-[10px] font-bold text-ink-faint">{t('common.actions')}</p>
              {filteredCommands.map((c) => (
                <button key={c.id} onClick={c.run} className="menu-item">
                  <c.icon className="h-4 w-4" /> <span>{c.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {searching && <p className="px-3 py-2 text-sm text-ink-faint">{t('common.loading')}</p>}
          {results && results.total > 0 &&
            results.groups.map((g) => (
              <div key={g.type} className="mb-1">
                <p className="px-3 py-1 text-[10px] font-bold text-ink-faint">{g.label}</p>
                {g.items.map((item) => {
                  const Icon = entityIcon(g.type);
                  return (
                    <button
                      key={`${g.type}:${item.id}`}
                      onClick={() => {
                        navigate(entityRoute(g.type, item.id));
                        setOpen(false);
                      }}
                      className="menu-item"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-start">{item.title}</span>
                      {item.sub && <span className="shrink-0 text-[10px] text-ink-faint">{item.sub}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          {results && results.total === 0 && !searching && (
            <p className="px-3 py-2 text-sm text-ink-faint">{t('search.noResults')}</p>
          )}
        </div>
        <p className="border-t border-line px-3 pt-2 text-[10px] text-ink-faint">
          Esc — {t('common.close')} · {t('ai.askAssistant')} → {t('nav.chat')}
        </p>
      </div>
    </div>
  );
}
