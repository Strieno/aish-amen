import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, CheckCircle2, Clock, GraduationCap, History, Link2, ListTodo, Plus, Sparkles, Target, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import type { TodayData } from '../lib/types';
import { Button, Card, EmptyState, ProgressBar, Skeleton, Spinner, StatCard } from '../components/ui';
import AiResultBox from '../components/AiResultBox';
import { SafeHomeScene, CalmEmptyScene } from '../components/SceneArt';
import SpeakButton from '../components/SpeakButton';
import { SafeLivingOrb, LifePulse, WeeklyLifeMap } from '../components/visualizations';
import NextActionsCard from '../components/gamification/NextActionsCard';
import TodayModeCard from '../components/TodayModeCard';
import DiscoveriesCard from '../components/gamification/DiscoveriesCard';
import SurpriseButton from '../components/gamification/SurpriseButton';
import { useProgressStore } from '../components/gamification/progress-store';
import { useAiAction } from '../lib/useAiAction';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import { primeSpeechPlayback, speakAutomatically } from '../lib/speech';
import { localDateKey } from '../lib/date';

const LEVEL_LABEL: Record<string, string> = {
  stable: 'today.stable',
  'slightly-overloaded': 'today.slightly',
  overloaded: 'today.overloaded',
};

function greeting(hour: number, lang: string) {
  if (lang === 'en') {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير';
  return 'مساء الهدوء';
}

export default function TodayPage() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const { data, loading, refetch } = useApi<TodayData>('/dashboard/today');
  const [suggestion, setSuggestion] = useState<string>('');
  const [suggestionError, setSuggestionError] = useState<string>('');
  const [suggesting, setSuggesting] = useState(false);
  const [newEvent, setNewEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');
  const planDay = useAiAction('plan-day');
  const nextTask = useAiAction('next-task');
  const lastSpokenSuggestion = useRef('');
  const progress = useProgressStore((s) => s.snapshot);

  const todayStr = localDateKey();

  const suggest = async (silent = false) => {
    if (!silent) primeSpeechPlayback();
    if (!silent) setSuggesting(true);
    try {
      const r = await api.post<{ suggestion?: string; error?: string; fallback?: boolean }>('/ai/suggest', {});
      setSuggestion(r.suggestion || '');
      setSuggestionError(r.error || '');
    } catch (error) {
      if (!silent) {
        setSuggestion('');
        setSuggestionError(error instanceof Error ? error.message : 'تعذر توليد الاقتراح الذكي.');
      }
    } finally {
      if (!silent) setSuggesting(false);
    }
  };

  useEffect(() => {
    suggest();
  }, []);

  useEffect(() => {
    if (!suggestion || suggestion === lastSpokenSuggestion.current) return;
    lastSpokenSuggestion.current = suggestion;
    void speakAutomatically(suggestion);
  }, [suggestion]);

  // Live intelligence: silently regenerate the cross-domain insight whenever
  // the dashboard data changes (new tasks, check-ins, links, activity...).
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => suggest(true), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const acceptLink = async (id: string) => {
    await api.post(`/links/suggestions/${id}/accept`);
    refetch();
  };
  const rejectLink = async (id: string) => {
    await api.post(`/links/suggestions/${id}/reject`);
    refetch();
  };

  const addEvent = async () => {
    if (!eventTitle.trim()) return;
    const start = `${todayStr}T${eventTime || '12:00'}:00`;
    await api.post('/calendar', { title: eventTitle, start, category: 'general' });
    setEventTitle('');
    setNewEvent(false);
    refetch();
  };

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-44" />
          <Spinner className="h-4 w-4 text-ink-faint" />
        </div>
        <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
          <Card className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-32" /><Skeleton className="h-3 w-full" /></Card>
          <Card className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /></Card>
        </div>
        <div aria-hidden="true">
          <Card className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </Card>
        </div>
      </div>
    );
  }

  const critical = (data?.tasks || []).filter((t) => t.priority === 'high');
  const recommended = (data?.tasks || []).filter((t) => t.priority === 'medium');
  const optional = (data?.tasks || []).filter((t) => t.priority === 'low');

  return (
    <div className="space-y-4">
      {/* Hero — greeting + animated art */}
      <div className="hero-gradient relative overflow-hidden rounded-card border border-brand-lighter/60 p-4 shadow-card animate-riseIn md:p-5">
        <span className="pointer-events-none absolute -top-16 -start-16 h-48 w-48 rounded-full bg-brand-accent/25 blur-3xl" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-20 -end-16 h-52 w-52 rounded-full bg-brand-lighter/60 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-dark">{t('app.name')}</p>
            <h1 className="mt-0.5 text-xl font-extrabold leading-tight text-ink md:text-2xl">{greeting(new Date().getHours(), lang)}</h1>
            <p className="mt-1 truncate text-[13px] text-ink-soft">
              {lang === 'en' ? new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' }) : new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}
              {progress ? ` • مستوى ${progress.level} • +${progress.xpToday} XP اليوم${progress.streaks.activity >= 3 ? ` • 🔥 ${progress.streaks.activity} أيام` : ''}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`chip ${
                  data?.safe.level === 'overloaded'
                    ? '!bg-danger-bg !text-danger'
                    : data?.safe.level === 'slightly-overloaded'
                      ? '!bg-warn-bg !text-warn'
                      : '!bg-card/70'
                }`}
              >
                {t(LEVEL_LABEL[data?.safe.level || 'stable'])}
              </span>
              {data?.nextEvent && (
                <span className="chip !bg-card/70 !text-ink-soft">
                  <Clock className="h-3 w-3" /> {data.nextEvent.start.slice(11, 16)} — {data.nextEvent.title}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <SafeHomeScene className="hidden h-24 w-32 shrink-0 opacity-90 md:block" />
            <SafeLivingOrb
              level={data?.safe.level || 'stable'}
              score={dayScore(data)}
              size={120}
              className="hidden sm:block"
            />
          </div>
        </div>
        <div className="relative z-10 mt-1">
          <SurpriseButton />
        </div>
      </div>

      {/* Smart Today Mode — one calm card with what matters now */}
      <TodayModeCard data={data} />

      {/* Current status + safe indicator */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card hover className="flex items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-bold text-ink-faint">{t('today.status')}</p>
            <p className="text-3xl font-extrabold leading-none text-ink" dir="ltr">{data?.now || '--:--'}</p>
          </div>
          {data?.nextEvent ? (
            <div className="min-w-0 flex-1 rounded-lg bg-brand-soft px-3 py-2">
              <p className="text-[11px] text-ink-faint">{t('today.nextEvent')}</p>
              <p className="truncate text-[13px] font-semibold text-brand-dark">
                {data.nextEvent.start.slice(11, 16)} — {data.nextEvent.title}
              </p>
            </div>
          ) : (
            <p className="flex-1 rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-ink-faint">
              {t('today.noTasksHint')}
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">{t('today.safeIndicator')}</h2>
            <span
              className={`chip ${
                data?.safe.level === 'overloaded'
                  ? '!bg-danger-bg !text-danger'
                  : data?.safe.level === 'slightly-overloaded'
                    ? '!bg-warn-bg !text-warn'
                    : ''
              }`}
            >
              {t(LEVEL_LABEL[data?.safe.level || 'stable'])}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {lang === 'en'
              ? 'An organizational estimate of today’s load — not a medical assessment.'
              : 'تقدير تنظيمي لضغط اليوم — وليس تقييمًا طبيًا.'}
          </p>
          <div className="mt-2.5 flex gap-1.5">
            {['stable', 'slightly-overloaded', 'overloaded'].map((lvl) => (
              <span
                key={lvl}
                className={`h-1.5 flex-1 rounded-pill ${
                  ['stable', 'slightly-overloaded', 'overloaded'].indexOf(data?.safe.level || 'stable') >=
                  ['stable', 'slightly-overloaded', 'overloaded'].indexOf(lvl)
                    ? lvl === 'overloaded'
                      ? 'bg-danger'
                      : lvl === 'slightly-overloaded'
                        ? 'bg-warn'
                        : 'bg-brand-accent'
                    : 'bg-line'
                }`}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* AI suggestion */}
      <Card className="gradient-border relative overflow-hidden">
        <span className="pointer-events-none absolute -top-10 -end-10 h-32 w-32 rounded-full bg-brand-soft/70 blur-2xl" aria-hidden="true" />
        <div className="relative mb-1.5 flex items-center gap-2 text-brand-dark">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-bold">{t('today.aiSuggestion')}</h2>
          {suggestion && (
            <span className="ms-auto">
              <SpeakButton text={suggestion} className="!h-7 !w-7" />
            </span>
          )}
        </div>
        {suggesting && !suggestion ? (
          <p className="flex items-center gap-2 text-sm text-ink-faint">
            <Spinner className="h-4 w-4" /> {t('today.suggestion')}
          </p>
        ) : suggestion ? (
          <p className="text-sm leading-relaxed text-ink">{suggestion}</p>
        ) : (
          <div className="text-sm text-ink-faint">
            <p className="mb-2">{suggestionError || 'لم يتم توليد اقتراح ذكي بعد.'}</p>
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => suggest()} disabled={suggesting}>
              <Sparkles className="h-3.5 w-3.5" /> إعادة المحاولة
            </Button>
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => planDay.run()} disabled={planDay.loading}>
            <Wand2 className="h-3.5 w-3.5" /> {t('ai.planDay')}
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => nextTask.run()} disabled={nextTask.loading}>
            <ListTodo className="h-3.5 w-3.5" /> {t('ai.nextTask')}
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => suggest()} disabled={suggesting}>
            <Sparkles className="h-3.5 w-3.5" /> {t('ai.suggest')}
          </Button>
        </div>
        <AiResultBox loading={planDay.loading || nextTask.loading} result={planDay.result || nextTask.result} compact />
      </Card>

      {/* Today's tasks */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">{t('today.tasks')}</h2>
          <Link to="/tasks" className="text-sm font-semibold text-brand-dark hover:underline">
            {t('common.add')}
          </Link>
        </div>
        {data?.tasks?.length === 0 && (
          <EmptyState
            text={t('today.noTasks')}
            art={<CalmEmptyScene />}
            action={
              <Link to="/tasks?new=1">
                <Button variant="ghost" className="!px-4 !py-2 text-xs">
                  <Plus className="h-4 w-4" /> {t('today.addTask')}
                </Button>
              </Link>
            }
          />
        )}
        {critical.length > 0 && <TaskGroup title={t('today.critical')} tasks={critical} tone="danger" />}
        {recommended.length > 0 && <TaskGroup title={t('today.recommended')} tasks={recommended} tone="brand" />}
        {optional.length > 0 && <TaskGroup title={t('today.optional')} tasks={optional} tone="neutral" />}
      </div>

      {/* Routine */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">{t('today.routine')}</h2>
          <button onClick={() => setNewEvent(true)} className="btn-icon" aria-label={t('today.addEvent')}>
            <CalendarPlus className="h-4 w-4" />
          </button>
        </div>
        {data?.schedule?.length ? (
          <Card className="!p-3">
            <ul className="divide-y divide-line">
              {data.schedule.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="w-12 text-sm font-bold text-brand-dark">{e.start.slice(11, 16)}</span>
                  <span className="text-sm text-ink">{e.title}</span>
                  <span className="ms-auto text-xs text-ink-faint">{e.category}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState text={lang === 'en' ? 'No events scheduled today.' : 'لا توجد أحداث مجدولة اليوم.'} />
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard value={String(data?.stats.doneToday ?? 0)} label={t('today.doneToday')} icon={CheckCircle2} />
        <StatCard value={`${data?.stats.focusMinutesToday ?? 0}م`} label={t('today.focusToday')} icon={Clock} />
        <StatCard value={String(data?.stats.openTotal ?? 0)} label={t('tasks.inbox')} icon={CalendarPlus} />
        <StatCard
          value={data?.checkin ? '✓' : '—'}
          label={t('today.checkin')}
          icon={CheckCircle2}
          to={data?.checkin ? undefined : '/safe'}
        />
      </div>

      {/* Life Pulse + weekly journey */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card hover>
          <div className="mb-1 flex items-center gap-2 text-brand-dark">
            <span className="text-xs font-bold">{t('today.lifePulse')}</span>
            <span className="ms-auto text-[10px] text-ink-faint">7 أبعاد</span>
          </div>
          <LifePulse points={lifePulsePoints(data)} className="h-24" />
        </Card>
        <Card hover>
          <div className="mb-1 flex items-center gap-2 text-brand-dark">
            <span className="text-xs font-bold">{t('today.weekMap')}</span>
          </div>
          <WeeklyLifeMap />
        </Card>
      </div>

      {/* What's next + discoveries */}
      <div className="grid gap-3 md:grid-cols-2">
        <NextActionsCard />
        <DiscoveriesCard />
      </div>

      {/* ======= Today Intelligence ======= */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 section-title">
          <Sparkles className="h-4 w-4 text-brand-dark" /> {t('today.intelligence')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {/* Study deadlines */}
          {(data?.intelligence?.study?.exams?.length || 0) > 0 && (
            <Card>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
                <GraduationCap className="h-4 w-4 text-brand-dark" /> {t('today.studyDeadlines')}
              </p>
              <ul className="space-y-1.5">
                {data?.intelligence?.study?.exams.map((e: { id: string; title: string; exam_date: string; course: string }) => (
                  <li key={e.id}>
                    <Link to="/study" className="flex items-center justify-between rounded-lg bg-elevated px-3 py-2 text-sm transition hover:shadow-card">
                      <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
                      <span className="shrink-0 text-xs text-warn">{e.exam_date}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Goal progress */}
          {(data?.intelligence?.goals?.length || 0) > 0 && (
            <Card>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
                <Target className="h-4 w-4 text-brand-dark" /> {t('today.goalsProgress')}
              </p>
              <ul className="space-y-2">
                {data?.intelligence?.goals.map((g: { id: string; title: string; progress: number }) => (
                  <li key={g.id}>
                    <Link to="/goals" className="block">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="truncate font-semibold text-ink">{g.title}</span>
                        <span className="text-ink-faint">{Math.round(g.progress * 100)}%</span>
                      </div>
                      <ProgressBar value={g.progress * 100} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Connections */}
        {(data?.intelligence?.connections?.length || 0) > 0 && (
          <Card className="!mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Link2 className="h-4 w-4 text-brand-dark" /> {t('today.connections')}
            </p>
            <div className="flex flex-wrap gap-2">
              {data?.intelligence?.connections.map((c: { id: string; source_type: string; source_id: string; target_type: string; target_id: string; created_by: string }) => {
                const Icon = entityIcon(c.target_type);
                return (
                  <Link key={c.id} to={entityRoute(c.target_type, c.target_id)} className="flex items-center gap-1.5 rounded-pill bg-elevated px-3 py-1 text-xs font-semibold text-ink-soft transition hover:bg-brand-soft hover:text-brand-dark">
                    <Icon className="h-3.5 w-3.5" />
                    {c.created_by === 'auto' && <Sparkles className="h-3 w-3 text-brand-dark" />}
                  </Link>
                );
              })}
            </div>
          </Card>
        )}

        {/* Pending link suggestions — one-tap approve */}
        {(data?.intelligence?.pendingLinks?.length ?? 0) > 0 && (
          <Card className="!mt-4 !border-brand-lighter">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Sparkles className="h-4 w-4 text-brand-dark" /> {t('related.suggestion')}
            </p>
            <div className="space-y-2">
              {(data?.intelligence?.pendingLinks || []).map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-xl bg-elevated px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {s.source_title || s.source_type} ↔ {s.target_title || s.target_type}
                    </p>
                    {s.reason && <p className="truncate text-[11px] text-ink-faint">{s.reason}</p>}
                  </div>
                  <span className="text-[10px] text-ink-faint">{Math.round(s.confidence * 100)}%</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => acceptLink(s.id)}>
                      {t('related.accept')}
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => rejectLink(s.id)}>
                      {t('related.reject')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Continue where you left off */}
        {data?.intelligence?.resume && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-faint">{t('today.resume')}</p>
              {data.intelligence.resume.task ? (
                <Link to={`/tasks?id=${data.intelligence.resume.task.id}`} className="block rounded-xl border border-line bg-card p-3 text-sm transition hover:shadow-card">
                  <ListTodo className="mb-1 h-4 w-4 text-brand-dark" />
                  <span className="line-clamp-2 text-ink">{data.intelligence.resume.task.title}</span>
                </Link>
              ) : null}
            </div>
            <div>
              {data.intelligence.resume.conversation ? (
                <Link to={`/chat?conv=${data.intelligence.resume.conversation.id}`} className="block rounded-xl border border-line bg-card p-3 text-sm transition hover:shadow-card">
                  <History className="mb-1 h-4 w-4 text-brand-dark" />
                  <span className="line-clamp-2 text-ink">{data.intelligence.resume.conversation.title}</span>
                </Link>
              ) : null}
            </div>
            <div>
              {data.intelligence.resume.journal ? (
                <Link to={`/journal?entry=${data.intelligence.resume.journal.id}`} className="block rounded-xl border border-line bg-card p-3 text-sm transition hover:shadow-card">
                  <Sparkles className="mb-1 h-4 w-4 text-brand-dark" />
                  <span className="line-clamp-2 text-ink">{data.intelligence.resume.journal.title || 'يوميات'}</span>
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {newEvent && (
        <div className="card mt-4 flex items-center gap-2 p-4">
          <input
            className="input flex-1"
            placeholder={lang === 'en' ? 'Event title' : 'عنوان الحدث'}
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
          />
          <input type="time" className="input w-32" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
          <Button onClick={addEvent}>{t('common.add')}</Button>
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  tone,
}: {
  title: string;
  tasks: { id: string; title: string; priority: string }[];
  tone: 'danger' | 'brand' | 'neutral';
}) {
  const dot = tone === 'danger' ? 'bg-danger' : tone === 'brand' ? 'bg-brand-accent' : 'bg-ink-faint';
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-bold text-ink-faint">{title}</p>
      <Card className="!p-2">
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span className="text-sm text-ink">{task.title}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** A calm 0..100 day score derived from real dashboard data (not medical). */
function dayScore(data: TodayData | null): number {
  let s = 50;
  s += Math.min(20, (data?.stats.doneToday ?? 0) * 5);
  s += Math.min(15, (data?.stats.focusMinutesToday ?? 0) / 4);
  if (data?.checkin) s += 5;
  if (data?.safe?.level === 'stable') s += 10;
  else if (data?.safe?.level === 'slightly-overloaded') s += 5;
  else s -= 10;
  return Math.min(100, Math.max(20, Math.round(s)));
}

/** The day's rhythm across real dimensions for LifePulse. */
function lifePulsePoints(data: TodayData | null) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const goalsAvg = (data?.intelligence?.goals?.length
    ? data.intelligence.goals.reduce((s, g) => s + (g.progress ?? 0), 0) / data.intelligence.goals.length
    : 0);
  return [
    { key: 'tasks', label: 'مهام', value: clamp((data?.stats.doneToday ?? 0) / 5) },
    { key: 'focus', label: 'تركيز', value: clamp((data?.stats.focusMinutesToday ?? 0) / 60) },
    { key: 'state', label: 'حالة', value: data?.checkin ? clamp((data.checkin.energy ?? 3) / 5) : 0.4 },
    { key: 'goals', label: 'أهداف', value: clamp(goalsAvg) },
    { key: 'study', label: 'دراسة', value: (data?.intelligence?.study?.exams?.length ?? 0) > 0 ? 0.7 : 0.25 },
    { key: 'schedule', label: 'جدول', value: clamp((data?.schedule?.length ?? 0) / 6) },
    { key: 'calm', label: 'هدوء', value: data?.safe?.level === 'stable' ? 0.85 : data?.safe?.level === 'slightly-overloaded' ? 0.5 : 0.25 },
  ];
}
