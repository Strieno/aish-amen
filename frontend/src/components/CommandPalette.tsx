import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CornerDownLeft, Heart, ListTodo, Search, Sparkles, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { NAV_ITEMS, navGroups } from '../lib/nav';
import { useT } from '../lib/i18n';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import type { SearchResults } from '../lib/types';

interface QuickCommand {
  id: string;
  label: string;
  icon: React.ElementType;
  run: () => void;
  groupLabel?: string;
}

/**
 * Ctrl+K command palette: universal search across every module plus grouped
 * quick-create & navigation commands. Fully keyboard-navigable (↑/↓ + Enter).
 */
export default function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
    setQ('');
    setResults(null);
    setActive(0);
    if (timer.current) window.clearTimeout(timer.current);
  }, [open]);

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
    }, 280);
    setActive(0);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q, open]);

  // Close when results come in if the input moved away from the flow.
  const quickCommands = useMemo<QuickCommand[]>(() => {
    const close = () => setOpen(false);
    const create: QuickCommand[] = [
      { id: 'new-task', label: `${t('quickActions.task')} — ${t('common.add')}`, icon: ListTodo, run: () => { navigate('/tasks?new=1'); close(); } },
      { id: 'new-journal', label: `${t('quickActions.note')} — ${t('common.add')}`, icon: BookOpen, run: () => { navigate('/journal?new=1'); close(); } },
      { id: 'new-gratitude', label: `${t('quickActions.gratitude')} — ${t('common.add')}`, icon: Heart, run: () => { navigate('/gratitude'); close(); } },
      { id: 'new-checkin', label: `${t('quickActions.checkin')}`, icon: Heart, run: () => { navigate('/safe'); close(); } },
      { id: 'focus', label: `${t('focus.start')} ${t('nav.focus')}`, icon: Timer, run: () => { navigate('/focus'); close(); } },
      { id: 'ask-ai', label: `${t('quickActions.chat')} (${t('ai.title')})`, icon: Sparkles, run: () => { navigate('/chat'); close(); } },
    ];
    const visibleIds = new Set(NAV_ITEMS.map((i) => i.id));
    const nav: QuickCommand[] = navGroups(NAV_ITEMS.filter((i) => visibleIds.has(i.id)))
      .flatMap(({ group, items }) =>
        items.map((item) => ({
          id: `nav-${item.id}`,
          label: t(item.labelKey),
          icon: item.icon,
          groupLabel: t(group.labelKey),
          run: () => { navigate(item.path); close(); },
        })),
      );
    return [...create, ...nav];
  }, [t, navigate]);

  const showResults = results && results.total > 0;
  const filteredCommands = useMemo(() => {
    if (showResults) return quickCommands;
    const term = q.trim().toLowerCase();
    const list = term ? quickCommands.filter((c) => c.label.toLowerCase().includes(term)) : quickCommands;
    return list.slice(0, 24);
  }, [quickCommands, q, showResults]);

  // Reset active when the visible list changes.
  useEffect(() => {
    if (active >= filteredCommands.length) setActive(0);
  }, [filteredCommands.length, active]);

  if (!open) return null;

  const runActive = () => filteredCommands[active]?.run();

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runActive();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[8vh]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="card relative z-10 w-full max-w-xl animate-fadeIn bg-card p-2"
      >
        <div className="flex items-center gap-2 border-b border-line px-2 pb-2">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onListKeyDown}
            placeholder={t('search.placeholder')}
            aria-label={t('search.title')}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          {searching && <span className="shrink-0 text-[10px] text-ink-faint">{t('common.loading')}</span>}
        </div>

        <div ref={listRef} className="mt-1.5 max-h-[58vh] overflow-y-auto px-1 pb-1" onKeyDown={onListKeyDown}>
          {searching ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-ink-faint">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-lighter border-t-brand" aria-hidden="true" />
              {t('common.loading')}
            </p>
          ) : showResults && results ? (
            /* ---- Search results ---- */
            <div className="mt-1">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t('search.title')}</p>
              {results.groups.map((g) => (
                <div key={g.type}>
                  <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold text-ink-faint">{g.label}</p>
                  {g.items.slice(0, 8).map((item) => {
                    const Icon = entityIcon(g.type);
                    return (
                      <button
                        key={`${g.type}:${item.id}`}
                        type="button"
                        onClick={() => {
                          navigate(entityRoute(g.type, item.id));
                          setOpen(false);
                        }}
                        className="menu-item w-full text-start"
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {item.sub && <span className="shrink-0 text-[10px] text-ink-faint">{item.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
              <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t('common.actions')}</p>
              {quickCommands.slice(0, 6).map((c) => (
                <button key={c.id} type="button" onClick={c.run} className="menu-item w-full text-start">
                  <c.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                </button>
              ))}
            </div>
          ) : (
            /* ---- Commands (grouped when idle, filtered while typing) ---- */
            <div>
              {filteredCommands.map((c, i) => (
                <div key={c.id}>
                  {c.groupLabel && (i === 0 || filteredCommands[i - 1].groupLabel !== c.groupLabel) && (
                    <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{c.groupLabel}</p>
                  )}
                  {!c.groupLabel && i === 0 && (
                    <p className="px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t('common.actions')}</p>
                  )}
                  <button
                    type="button"
                    onClick={c.run}
                    onMouseEnter={() => setActive(i)}
                    className={`menu-item w-full text-start ${i === active ? '!bg-brand-soft !text-brand-dark' : ''}`}
                  >
                    <c.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {i === active && <CornerDownLeft className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />}
                  </button>
                </div>
              ))}
              {filteredCommands.length === 0 && <p className="px-3 py-3 text-sm text-ink-faint">{t('search.noResults')}</p>}
            </div>
          )}
        </div>

        <p className="border-t border-line px-2 pt-1.5 text-[10px] text-ink-faint">
          <kbd className="rounded border border-line bg-elevated px-1">↑↓</kbd> {t('palette.nav')} ·{' '}
          <kbd className="rounded border border-line bg-elevated px-1">Enter</kbd> {t('palette.open')} ·{' '}
          <kbd className="rounded border border-line bg-elevated px-1">Esc</kbd> {t('palette.close')}
        </p>
      </div>
    </div>
  );
}
