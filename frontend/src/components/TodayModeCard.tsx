import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Moon, Sparkles } from 'lucide-react';
import { useT } from '../lib/i18n';
import { priorityInfo, sortOpenTasks } from '../lib/priority';
import { localDateKey } from '../lib/date';
import { Button, Card, ProgressBar } from './ui';
import type { TodayData } from '../lib/types';

/**
 * "وضع اليوم" — a deliberately low-stress card.
 *
 * Shows only what matters right now: one top task, two secondary tasks, the
 * next appointment, and a small progress bar. The "ما الذي يجب أن أفعله الآن؟"
 * action always picks the single best next task from real data.
 */
export default function TodayModeCard({ data }: { data: TodayData | null }) {
  const t = useT();
  const navigate = useNavigate();
  const today = localDateKey();

  const { top, secondary } = useMemo(() => {
    if (!data?.tasks?.length) return { top: null, secondary: [] as TodayData['tasks'] };
    const open = data.tasks.filter((x) => x.status !== 'done' && x.status !== 'cancelled');
    const ranked = sortOpenTasks(open, today);
    return { top: ranked[0] ?? null, secondary: ranked.slice(1, 3) };
  }, [data, today]);

  const doneToday = data?.stats.doneToday ?? 0;
  const openToday = (data?.tasks ?? []).filter((x) => x.status !== 'done' && x.status !== 'cancelled').length;
  const progress = openToday + doneToday > 0 ? Math.min(100, Math.round((doneToday / (openToday + doneToday)) * 100)) : 0;

  if (!top && !data?.nextEvent && openToday === 0 && doneToday === 0) {
    return (
      <Card className="border-dashed">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg" aria-hidden="true">✨</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">{t('todayMode.empty')}</p>
            <p className="text-xs text-ink-faint">{t('todayMode.emptyHint')}</p>
          </div>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => navigate('/tasks?new=1')}>
            + {t('today.addTask')}
          </Button>
        </div>
      </Card>
    );
  }

  const reasons = (task: TodayData['tasks'][number]) => {
    const list: string[] = [];
    const info = priorityInfo(task, today);
    if (info.overdueDays > 0) list.push(`متأخرة ${info.overdueDays} يوم`);
    else if (info.daysUntilDue !== null && info.daysUntilDue <= 3) list.push(`مستحقة خلال ${info.daysUntilDue} يوم`);
    else if (info.daysUntilDue !== null && info.daysUntilDue <= 7) list.push(`مستحقة خلال ${info.daysUntilDue} أيام`);
    if (task.priority === 'high') list.push('أولوية عالية');
    if (task.status === 'in-progress') list.push('قيد الإنجاز');
    if (Number(task.est_minutes)) list.push(`${task.est_minutes} د`);
    return list.slice(0, 3);
  };

  return (
    <Card className="relative overflow-hidden border-brand-lighter/70 bg-gradient-to-b from-brand-soft/40 to-card">
      <span className="pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full bg-brand-soft blur-2xl" aria-hidden="true" />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white" aria-hidden="true">
            <Moon className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-extrabold text-ink">{t('todayMode.title')}</h2>
          <span className="ms-auto flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
            <CheckCircle2 className="h-3.5 w-3.5 text-brand-accent" />
            {doneToday} / {openToday + doneToday} {t('todayMode.progress')}
          </span>
        </div>

        {top && (
          <button
            onClick={() => navigate(`/tasks?id=${top.id}`)}
            className="group block w-full rounded-xl border border-brand-lighter/60 bg-card p-3 text-start transition hover:shadow-card"
          >
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-brand-dark">
              <Sparkles className="h-3.5 w-3.5" /> {t('todayMode.topTask')}
            </p>
            <p className="text-sm font-semibold leading-snug text-ink">{top.title}</p>
            {reasons(top).length > 0 && (
              <span className="mt-1.5 flex flex-wrap gap-1">
                {reasons(top).map((r) => (
                  <span key={r} className="rounded-pill bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-dark">{r}</span>
                ))}
              </span>
            )}
          </button>
        )}

        {(secondary.length > 0 || data?.nextEvent) && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {secondary.length > 0 && (
              <div className="rounded-xl border border-line bg-card/70 p-2.5">
                <p className="mb-1.5 text-[11px] font-bold text-ink-faint">{t('todayMode.secondary')}</p>
                <ul className="space-y-1.5">
                  {secondary.map((task) => (
                    <li key={task.id}>
                      <button onClick={() => navigate(`/tasks?id=${task.id}`)} className="w-full truncate text-start text-[13px] text-ink transition hover:text-brand-dark">
                        {task.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data?.nextEvent && (
              <div className="rounded-xl border border-line bg-card/70 p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-ink-faint">
                  <CalendarClock className="h-3.5 w-3.5" /> {t('todayMode.nextEvent')}
                </p>
                <p className="truncate text-[13px] font-semibold text-ink">
                  <span className="text-brand-dark" dir="ltr">{data.nextEvent.start.slice(11, 16)}</span> — {data.nextEvent.title}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <ProgressBar value={progress} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button className="!px-3.5 !py-1.5 text-xs" onClick={() => navigate(top ? `/tasks?id=${top.id}` : '/tasks?new=1')}>
            <Sparkles className="h-3.5 w-3.5" /> {t('todayMode.whatNow')}
          </Button>
          {data?.nextEvent && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => navigate('/')}>
              <CalendarClock className="h-3.5 w-3.5" /> {t('today.routine')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
