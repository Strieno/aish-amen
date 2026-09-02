import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BatteryLow,
  BookOpen,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Heart,
  Library,
  ListTodo,
  Music,
  Network,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import type { Goal, JournalEntry, TodayData, WorkShift } from '../lib/types';
import { Button, ProgressBar, QuickAction, Skeleton, SmartWidget, StatusChip } from '../components/ui';
import { priorityInfo, rankDay } from '../lib/priority';
import { computeAdaptive } from '../lib/adaptive';
import { localDateKey } from '../lib/date';

/**
 * Life hub — one calm page for everything that isn't study:
 * safe living, tasks, gratitude, journal, goals, work and focus.
 * Each section is compact and links to its full page.
 */
export default function LifePage() {
  const t = useT();
  const navigate = useNavigate();
  const lang = useAppStore((s) => s.settings.language);
  const { data: today, loading } = useApi<TodayData>('/dashboard/today');
  const { data: journal } = useApi<JournalEntry[]>('/journal');
  const { data: goals } = useApi<Goal[]>('/goals');
  const { data: shifts } = useApi<WorkShift[]>('/work/shifts');
  const [gratText, setGratText] = useState('');
  const [gratSaved, setGratSaved] = useState(false);
  const todayKey = localDateKey();

  const adaptive = useMemo(() => computeAdaptive(today), [today]);
  const ranked = useMemo(() => (today?.tasks ? rankDay(today.tasks, todayKey, { energy: adaptive.energy, hour: new Date().getHours(), examDays: adaptive.examDays }) : []), [today, todayKey, adaptive]);

  const todaysShift = useMemo(() => {
    if (!shifts) return null;
    return shifts.find((s) => (s.shift_start || '').startsWith(todayKey)) || null;
  }, [shifts, todayKey]);

  useEffect(() => {
    if (!gratSaved) return;
    const timer = window.setTimeout(() => setGratSaved(false), 1800);
    return () => window.clearTimeout(timer);
  }, [gratSaved]);

  const saveGratitude = async () => {
    if (!gratText.trim()) return;
    await api.post('/gratitude', { items: [gratText.trim().slice(0, 200)] });
    setGratText('');
    setGratSaved(true);
  };

  const tools = [
    { id: 'memory', icon: Sparkles, path: '/memory', labelKey: 'nav.memory' },
    { id: 'knowledge', icon: Library, path: '/knowledge', labelKey: 'nav.knowledge' },
    { id: 'audio', icon: Music, path: '/audio', labelKey: 'nav.audio' },
    { id: 'insights', icon: CheckCircle2, path: '/insights', labelKey: 'nav.insights' },
    { id: 'graph', icon: Network, path: '/graph', labelKey: 'graph.title' },
    { id: 'timeline', icon: CalendarClock, path: '/timeline', labelKey: 'timeline.title' },
  ];

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2" role="status" aria-live="polite" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight text-ink">{t('life.title')}</h1>
          <p className="mt-0.5 text-[12px] text-ink-faint">{t('life.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <QuickAction label={t('quickActions.task')} icon={ListTodo} onClick={() => window.dispatchEvent(new CustomEvent('aish:open-quick-capture', { detail: { type: 'task' } }))} />
          <QuickAction label={t('quickActions.note')} icon={BookOpen} onClick={() => window.dispatchEvent(new CustomEvent('aish:open-quick-capture', { detail: { type: 'journal' } }))} />
          <QuickAction label={t('quickActions.gratitude')} icon={Heart} tone="brand" onClick={() => window.dispatchEvent(new CustomEvent('aish:open-quick-capture', { detail: { type: 'gratitude' } }))} />
        </div>
      </div>

      <div className="grid items-start gap-2.5 md:grid-cols-2">
        {/* Safe living */}
        <SmartWidget
          title={t('life.safe')}
          icon={ShieldCheck}
          action={<Link to="/safe" className="text-[11px] font-bold text-brand-dark hover:underline">{t('life.open')}</Link>}
        >
          <div className="flex items-center gap-2">
            <StatusChip tone={adaptive.load === 'overloaded' ? 'danger' : adaptive.load === 'slightly-overloaded' ? 'warn' : 'brand'}>
              {t(adaptive.load === 'overloaded' ? 'today.overloaded' : adaptive.load === 'slightly-overloaded' ? 'today.slightly' : 'today.stable')}
            </StatusChip>
            <p className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
              {today?.checkin
                ? `${t('checkin.energy')}: ${today.checkin.energy ?? '—'}/5`
                : lang === 'en' ? 'No check-in yet today' : 'لا يوجد تسجيل حالة اليوم'}
            </p>
            {!today?.checkin && <Button className="!px-2 !py-0.5 text-[10px]" onClick={() => navigate('/safe')}>{t('quickActions.checkin')}</Button>}
          </div>
        </SmartWidget>

        {/* Tasks */}
        <SmartWidget
          title={t('life.tasks')}
          icon={ListTodo}
          action={<Link to="/tasks" className="text-[11px] font-bold text-brand-dark hover:underline">{t('common.all')}</Link>}
        >
          {ranked.length === 0 ? (
            <p className="py-0.5 text-[12px] text-ink-faint">{t('prio.empty')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {ranked.slice(0, 3).map((r) => {
                const info = priorityInfo(r.task, todayKey);
                return (
                  <li key={r.task.id}>
                    <Link to={`/tasks?id=${r.task.id}`} className="flex items-center gap-2 px-1 py-1.5 text-[13px] transition hover:bg-elevated">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${info.overdueDays > 0 ? 'bg-danger' : r.tier === 'now' ? 'bg-danger' : r.tier === 'today' ? 'bg-warn' : 'bg-brand-accent'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-ink">{r.task.title}</span>
                      {info.overdueDays > 0 && <span className="shrink-0 text-[10px] font-bold text-danger">-{info.overdueDays}d</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SmartWidget>

        {/* Gratitude quick add */}
        <SmartWidget title={t('life.gratitude')} icon={Heart} action={<Link to="/gratitude" className="text-[11px] font-bold text-brand-dark hover:underline">{t('life.open')}</Link>}>
          <div className="flex items-center gap-1.5">
            <input
              className="input !min-h-8 !rounded-lg !px-2 !py-1 text-[13px]"
              placeholder={t('life.gratitudePlaceholder')}
              aria-label={t('life.gratitudePlaceholder')}
              value={gratText}
              onChange={(e) => setGratText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveGratitude()}
            />
            <Button className="!px-2 !py-1 text-[11px]" onClick={saveGratitude} disabled={!gratText.trim()}>
              {gratSaved ? '✓' : t('common.add')}
            </Button>
          </div>
        </SmartWidget>

        {/* Journal */}
        <SmartWidget title={t('life.journal')} icon={BookOpen} action={<Link to="/journal" className="text-[11px] font-bold text-brand-dark hover:underline">{t('life.open')}</Link>}>
          {(journal || []).length === 0 ? (
            <p className="py-0.5 text-[12px] text-ink-faint">{t('life.noJournal')}</p>
          ) : (
            <ul className="space-y-1">
              {(journal || []).slice(0, 2).map((e) => (
                <li key={e.id}>
                  <Link to={`/journal?entry=${e.id}`} className="block truncate rounded-lg px-1.5 py-1 text-[13px] text-ink transition hover:bg-elevated">
                    {e.title || e.content.slice(0, 40)}
                    <span className="ms-1 text-[10px] text-ink-faint">{e.entry_date}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SmartWidget>

        {/* Goals */}
        <SmartWidget title={t('life.goals')} icon={CalendarClock} action={<Link to="/goals" className="text-[11px] font-bold text-brand-dark hover:underline">{t('life.open')}</Link>}>
          {(goals || []).length === 0 ? (
            <p className="py-0.5 text-[12px] text-ink-faint">{t('life.noGoals')}</p>
          ) : (
            <ul className="space-y-1.5">
              {(goals || []).slice(0, 3).map((g) => (
                <li key={g.id}>
                  <Link to="/goals" className="block">
                    <div className="mb-0.5 flex justify-between text-[11px]">
                      <span className="truncate font-semibold text-ink">{g.title}</span>
                      <span className="text-ink-faint">{Math.round(g.progress * 100)}%</span>
                    </div>
                    <ProgressBar value={g.progress * 100} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SmartWidget>

        {/* Work */}
        <SmartWidget title={t('life.work')} icon={Briefcase} action={<Link to="/work" className="text-[11px] font-bold text-brand-dark hover:underline">{t('life.open')}</Link>}>
          {todaysShift ? (
            <div className="flex items-center gap-2 px-1 py-0.5 text-[13px] text-ink">
              <StatusChip tone="brand">{t('life.shiftToday')}</StatusChip>
              <span className="text-[12px] text-ink-soft" dir="ltr">{todaysShift.shift_start.slice(11, 16)}</span>
              {todaysShift.role && <span className="truncate text-[12px] text-ink-faint">{todaysShift.role}</span>}
            </div>
          ) : (
            <p className="py-0.5 text-[12px] text-ink-faint">{t('life.noShift')}</p>
          )}
        </SmartWidget>

        {/* Focus */}
        <SmartWidget title={t('life.focus')} icon={Timer} action={<Link to="/focus" className="text-[11px] font-bold text-brand-dark hover:underline">{t('life.open')}</Link>}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-ink-soft">
              {today?.stats.focusMinutesToday ?? 0} {lang === 'en' ? 'min today' : 'دقيقة اليوم'}
            </p>
            <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => navigate('/focus')}>
              <Timer className="h-3 w-3" /> {t('focus.start')}
            </Button>
          </div>
        </SmartWidget>

        {/* Energy + other tools */}
        <SmartWidget title={t('widget.energy')} icon={BatteryLow}>
          <div className="flex items-center gap-1" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={`h-1.5 flex-1 rounded-pill ${today?.checkin?.energy != null && n <= today.checkin.energy ? 'bg-brand-accent' : 'bg-line'}`} />
            ))}
          </div>
          {!today?.checkin && (
            <p className="mt-1.5 text-[11px] text-ink-faint">{lang === 'en' ? 'Check in to unlock adaptive day' : 'سجّل حالتك لتفعيل يوم تكيّفي'}</p>
          )}
        </SmartWidget>
      </div>

      {/* Other tools */}
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t('life.tools')}</p>
        <div className="flex flex-wrap gap-1.5">
          {tools.map(({ id, icon: Icon, path, labelKey }) => (
            <Link
              key={id}
              to={path}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[12px] font-semibold text-ink-soft transition hover:border-brand-lighter hover:bg-brand-soft/60 hover:text-brand-dark"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t(labelKey)}
              <ArrowUpRight className="h-3 w-3 opacity-60" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
