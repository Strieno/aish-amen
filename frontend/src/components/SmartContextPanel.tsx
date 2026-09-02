import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Brain, CalendarClock, CheckCircle2, History, Link2, MessageCircle, Sparkles, Target, X } from 'lucide-react';
import { api } from '../lib/api';
import { liveBus } from '../lib/live';
import { useT } from '../lib/i18n';
import type { SmartContextData } from '../lib/types';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import { Spinner } from './ui';

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
    '/graph': 'graph',
    '/timeline': 'timeline',
    '/settings': 'settings',
  };
  return map[path] || 'today';
}

/**
 * Global "السياق الذكي" drawer: page-adaptive cross-domain context.
 * Toggled from the header, available on every page.
 */
export default function SmartContextPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const location = useLocation();
  const page = pageFromPath(location.pathname);
  const [data, setData] = useState<SmartContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    const load = () => {
      setLoading(true);
      api
        .get<SmartContextData>(`/smart-context?page=${page}`)
        .then((d) => setData(d))
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    };
    loadRef.current = load;
    if (open) load();
  }, [open, page]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Live refresh while the drawer is open.
  useEffect(() => {
    if (!open) return;
    let timer: number | null = null;
    const unsub = liveBus.subscribe(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => loadRef.current(), 400);
    });
    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  const safeData = data ? {
    ...data,
    related: Array.isArray(data.related) ? data.related : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    goals: Array.isArray(data.goals) ? data.goals : [],
    memories: Array.isArray(data.memories) ? data.memories : [],
    deadlines: Array.isArray(data.deadlines) ? data.deadlines : [],
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
    activity: Array.isArray(data.activity) ? data.activity : [],
  } : null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute end-0 top-0 flex h-full w-[min(380px,100vw)] flex-col border-s border-line bg-card shadow-card-hover animate-fadeIn">
        <div className="flex items-center gap-2 border-b border-line bg-brand-soft px-4 py-3">
          <Sparkles className="h-4 w-4 text-brand-dark" />
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">{t('smart.title')}</p>
            <p className="text-[11px] text-ink-faint">{t('smart.hint')}</p>
          </div>
           <button onClick={onClose} className="btn-icon !h-7 !w-7" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <Spinner className="mx-auto mt-10 block h-6 w-6" />
          ) : !safeData || safeData.related.length + safeData.tasks.length + safeData.goals.length + safeData.memories.length + safeData.deadlines.length + safeData.activity.length === 0 ? (
            <p className="mt-10 text-center text-sm text-ink-faint">{t('smart.empty')}</p>
          ) : (
            <>
              {safeData.focus && (
                <div className="rounded-xl bg-brand-soft p-3">
                  <p className="text-[11px] font-bold text-ink-faint">تركيز</p>
                  <p className="truncate text-sm font-bold text-ink">{safeData.focus.title}</p>
                </div>
              )}

              {safeData.related.length > 0 && (
                <Section title={t('smart.related')} icon={Link2}>
                  {safeData.related.map((r) => (
                    <ItemRow key={r.link_id} type={r.type} id={r.id} title={r.title} sub={r.relationship_type} />
                  ))}
                </Section>
              )}

              {safeData.deadlines.length > 0 && (
                <Section title={t('smart.deadlines')} icon={CalendarClock}>
                  {safeData.deadlines.map((d) => (
                    <ItemRow key={`${d.type}:${d.id}`} type={d.type} id={d.id} title={d.title} sub={d.sub} />
                  ))}
                </Section>
              )}

              {safeData.tasks.length > 0 && (
                <Section title={t('smart.tasks')} icon={CheckCircle2}>
                  {safeData.tasks.map((task) => (
                    <ItemRow key={task.id} type="task" id={task.id} title={task.title} sub={task.sub} />
                  ))}
                </Section>
              )}

              {safeData.goals.length > 0 && (
                <Section title={t('smart.goals')} icon={Target}>
                  {safeData.goals.map((g) => (
                    <ItemRow key={g.id} type="goal" id={g.id} title={g.title} sub={g.sub} />
                  ))}
                </Section>
              )}

              {safeData.memories.length > 0 && (
                <Section title={t('smart.memories')} icon={Brain}>
                  {safeData.memories.map((m) => (
                    <ItemRow key={m.id} type="memory" id={m.id} title={m.title} sub={m.sub} />
                  ))}
                </Section>
              )}

              {safeData.conversations.length > 0 && (
                <Section title={t('smart.conversations')} icon={MessageCircle}>
                  {safeData.conversations.map((c) => (
                    <ItemRow key={c.id} type="conversation" id={c.id} title={c.title} sub={c.sub} />
                  ))}
                </Section>
              )}

              {safeData.activity.length > 0 && (
                <Section title={t('smart.activity')} icon={History}>
                  {safeData.activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink-soft">{a.title}</span>
                        <span className="text-[10px] text-ink-faint">{a.sub}</span>
                      </span>
                    </li>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-faint">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function ItemRow({ type, id, title, sub }: { type: string; id: string; title: string; sub?: string }) {
  const Icon = entityIcon(type);
  const route = entityRoute(type, id);
  return (
    <li>
      <Link to={route} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-elevated">
        <Icon className="h-4 w-4 shrink-0 text-brand-dark" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink group-hover:underline">{title}</span>
          {sub && <span className="block truncate text-[10px] text-ink-faint">{sub}</span>}
        </span>
      </Link>
    </li>
  );
}
