import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock,
  GraduationCap,
  Heart,
  History,
  Lightbulb,
  ListTodo,
  MessageCircle,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Wand2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import type { TodayData } from '../lib/types';
import { Button, CompactCard, ProgressBar, QuickAction, Skeleton, SmartSuggestion, SmartWidget, Spinner, StatusChip } from '../components/ui';
import AiResultBox from '../components/AiResultBox';
import SpeakButton from '../components/SpeakButton';
import { LifePulse, WeeklyLifeMap } from '../components/visualizations';
import NextActionsCard from '../components/gamification/NextActionsCard';
import DiscoveriesCard from '../components/gamification/DiscoveriesCard';
import SurpriseButton from '../components/gamification/SurpriseButton';
import { useProgressStore } from '../components/gamification/progress-store';
import { useAiAction } from '../lib/useAiAction';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import { primeSpeechPlayback, speakAutomatically } from '../lib/speech';
import { localDateKey } from '../lib/date';
import { priorityInfo, sortOpenTasks, type PriorityTier } from '../lib/priority';

const LEVEL_LABEL: Record<string, string> = {
  stable: 'today.stable',
  'slightly-overloaded': 'today.slightly',
  overloaded: 'today.overloaded',
};

const TIER_DOT: Record<PriorityTier, string> = { urgent: 'bg-danger', important: 'bg-warn', later: 'bg-brand-accent', optional: 'bg-ink-faint' };

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

const openQuick = (type: 'task' | 'journal' | 'gratitude') =>
  window.dispatchEvent(new CustomEvent('aish:open-quick-capture', { detail: { type } }));

export default function TodayPage() {
  const t = useT();
  const navigate = useNavigate();
  const lang = useAppStore((s) => s.settings.language);
  const { data, loading, refetch } = useApi<TodayData>('/dashboard/today');
  const [calm, setCalm] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [suggestionError, setSuggestionError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [newEvent, setNewEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');
  const planDay = useAiAction('plan-day');
  const nextTask = useAiAction('next-task');
  const lastSpokenSuggestion = useRef('');
  const progress = useProgressStore((s) => s.snapshot);
  const setPanelOpen = useProgressStore((s) => s.setPanelOpen);

  const todayStr = localDateKey();
  const openTasks = useMemo(() => {
    if (!data?.tasks) return [];
    return sortOpenTasks(data.tasks, todayStr).filter((x) => x.status !== 'done' && x.status !== 'cancelled');
  }, [data, todayStr]);

  const suggest = async (silent = false) => {
    if (!silent) primeSpeechPlayback();
    if (!silent) setSuggesting(true);
    try {
      const r = await api.post<{ suggestion?: string; error?: string }>('/ai/suggest', {});
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

  // First load: fetch an AI suggestion once.
  useEffect(() => {
    suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!suggestion || suggestion === lastSpokenSuggestion.current) return;
    lastSpokenSuggestion.current = suggestion;
    void speakAutomatically(suggestion);
  }, [suggestion]);

  // Silently refresh the insight when the dashboard data changes.
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => suggest(true), 1600);
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
      <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-44" />
          <Spinner className="h-4 w-4 text-ink-faint" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-3 md:col-span-2" aria-hidden="true">
            <Skeleton className="h-12 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        </div>
      </div>
    );
  }

  const exams = data?.intelligence?.study?.exams || [];
  const goals = data?.intelligence?.goals || [];
  const resume = data?.intelligence?.resume;
  const pendingLinks = data?.intelligence?.pendingLinks || [];
  const connections = data?.intelligence?.connections || [];
  const openCount = openTasks.length;
  const doneToday = data?.stats.doneToday ?? 0;
  const total = openCount + doneToday;
  const dayProgress = total > 0 ? Math.round((doneToday / total) * 100) : 0;
  const hasCheckin = Boolean(data?.checkin);

  const hint = useMemo(() => {
    if (!data) return '';
    if (openTasks.length === 0 && doneToday === 0) return t('dash.sug.noTasks');
    if (exams.length > 0) return t('dash.sug.study');
    if (!hasCheckin) return t('dash.sug.noCheckin');
    if (data.checkin?.energy != null && data.checkin.energy <= 2 && openTasks.length > 0) return t('dash.sug.lowEnergy');
    if (!data.checkin) return t('dash.sug.noGratitude');
    return t('dash.sug.whatNow');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, openTasks.length, exams.length, hasCheckin, t]);

  return (
    <div className={`space-y-3 ${calm ? 'opacity-100' : ''}`}>
      {/* ===== Compact hero / status line ===== */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-card/70 px-3 py-2.5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-base font-extrabold leading-tight text-ink">{greeting(new Date().getHours(), lang)}</span>
            {progress && progress.level ? (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                title={`${t('progress.level')} ${progress.level} — ${progress.xp} XP`}
                className="chip !px-2 !text-[10px] transition hover:opacity-90"
              >
                {progress.level} {progress.xpToday > 0 ? `+${progress.xpToday} XP` : ''}
              </button>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint">
            <span>
              {lang === 'en'
                ? new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })
                : new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <StatusChip tone={data?.safe.level === 'overloaded' ? 'danger' : data?.safe.level === 'slightly-overloaded' ? 'warn' : 'brand'}>
              {t(LEVEL_LABEL[data?.safe.level || 'stable'])}
            </StatusChip>
            {data?.nextEvent && (
              <span className="inline-flex items-center gap-1 text-ink-soft">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span dir="ltr">{data.nextEvent.start.slice(11, 16)}</span> {data.nextEvent.title}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <QuickAction label={t('quickActions.chat')} icon={MessageCircle} tone="brand" onClick={() => navigate('/chat')} />
          <button
            type="button"
            onClick={() => setCalm((v) => !v)}
            aria-pressed={calm}
            title={t('calm.hint')}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition active:scale-[0.97] ${
              calm ? 'border-brand bg-brand text-white shadow-button' : 'border-line bg-card text-ink-soft hover:border-brand-lighter hover:bg-brand-soft/60 hover:text-brand-dark'
            }`}
          >
            <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t('calm.title')}</span>
          </button>
        </div>
      </div>

      {/* ===== Layout: main column + side rail ===== */}
      <div className="grid items-start gap-3 lg:grid-cols-3">
        {/* ---------- Main column ---------- */}
        <div className="min-w-0 space-y-3 lg:col-span-2">
          {/* Smart contextual suggestion */}
          <SmartSuggestion
            text={hint}
            actions={
              <>
                <Button variant="ghost" className="!px-2.5 !py-1 text-[11px]" onClick={() => nextTask.run()} disabled={nextTask.loading}>
                  <Wand2 className="h-3 w-3" /> {t('dash.sug.whatNow')}
                </Button>
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => navigate(openTasks.length ? '/tasks' : '/tasks?new=1')}>
                  {t(openTasks.length ? 'nav.tasks' : 'quickActions.task')}
                </Button>
              </>
            }
          />

          {/* Quick action strip — everything is one tap */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t('quickActions.title')}>
            <QuickAction label={t('quickActions.task')} icon={Plus} onClick={() => openQuick('task')} />
            <QuickAction label={t('quickActions.note')} icon={BookOpen} onClick={() => openQuick('journal')} />
            <QuickAction label={t('quickActions.gratitude')} icon={Heart} onClick={() => openQuick('gratitude')} />
            <QuickAction label={t('quickActions.focus')} icon={Timer} onClick={() => navigate('/focus')} />
            <QuickAction label={t('quickActions.checkin')} icon={CheckCircle2} tone="brand" onClick={() => navigate('/safe')} />
          </div>

          {/* Top tasks — أهم 3 مهام */}
          <SmartWidget
            title={t('today.tasks')}
            icon={ListTodo}
            action={
              <Link to="/tasks" className="flex items-center gap-0.5 text-[11px] font-bold text-brand-dark hover:underline" aria-label={t('common.all')}>
                {t('common.all')} <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          >
            {openCount === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                <p className="text-[13px] text-ink-soft">{t('today.noTasksHint')}</p>
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => openQuick('task')}>
                  <Plus className="h-3 w-3" /> {t('quickActions.task')}
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {openTasks.slice(0, 3).map((task, i) => {
                  const info = priorityInfo(task, todayStr);
                  return (
                    <li key={task.id}>
                      <Link
                        to={`/tasks?id=${task.id}`}
                        className="group flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition hover:bg-elevated"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-elevated text-[11px] font-bold text-ink-faint group-hover:bg-brand-soft group-hover:text-brand-dark">
                          {i + 1}
                        </span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${TIER_DOT[info.tier]}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{task.title}</span>
                        {info.overdueDays > 0 ? (
                          <span className="shrink-0 text-[10px] font-bold text-danger">-{info.overdueDays}d</span>
                        ) : info.daysUntilDue !== null && info.daysUntilDue <= 3 ? (
                          <span className="shrink-0 text-[10px] font-semibold text-warn">+{info.daysUntilDue}d</span>
                        ) : null}
                        {Number(task.est_minutes) ? <span className="shrink-0 text-[10px] text-ink-faint">{task.est_minutes}د</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {total > 0 && (
              <div className="mt-1.5 flex items-center gap-2 border-t border-line pt-2">
                <div className="min-w-0 flex-1">
                  <ProgressBar value={dayProgress} />
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-ink-soft">
                  {doneToday}/{total}
                </span>
              </div>
            )}
          </SmartWidget>

          {/* Schedule — جدول اليوم */}
          <SmartWidget
            title={t('today.routine')}
            icon={CalendarClock}
            action={
              <button onClick={() => setNewEvent((v) => !v)} className="btn-icon !h-6 !w-6" aria-label={t('today.addEvent')} title={t('today.addEvent')}>
                <CalendarPlus className="h-3.5 w-3.5" />
              </button>
            }
          >
            {newEvent && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-line bg-elevated/60 p-1.5">
                <input
                  autoFocus
                  className="input !min-h-8 !rounded-lg !px-2 !py-1 text-[13px]"
                  placeholder={lang === 'en' ? 'Event title' : 'عنوان الحدث'}
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                  aria-label={lang === 'en' ? 'Event title' : 'عنوان الحدث'}
                />
                <input type="time" className="input w-24 !min-h-8 !rounded-lg !px-2 !py-1 text-[13px]" value={eventTime} onChange={(e) => setEventTime(e.target.value)} aria-label="time" />
                <Button className="!px-2 !py-1 text-[11px]" onClick={addEvent}>{t('common.add')}</Button>
              </div>
            )}
            {data?.schedule?.length ? (
              <ul className="divide-y divide-line">
                {data.schedule.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-1 py-1.5 text-[13px]">
                    <span className="w-11 shrink-0 rounded-md bg-elevated px-1 py-0.5 text-center text-[11px] font-bold text-brand-dark" dir="ltr">
                      {e.start.slice(11, 16)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
                    {e.category && e.category !== 'general' ? <span className="shrink-0 text-[10px] text-ink-faint">{e.category}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-1 text-[13px] text-ink-faint">{lang === 'en' ? 'No events scheduled today.' : 'لا توجد أحداث مجدولة اليوم.'}</p>
            )}
          </SmartWidget>

          {/* الذكاء والتفاصيل (collapsed by default to keep the day calm) */}
          {!calm && (
            <details className="group rounded-card border border-line bg-card/60">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold text-ink-soft transition hover:bg-elevated/60 hover:text-ink">
                <Sparkles className="h-3.5 w-3.5 text-brand-dark" aria-hidden="true" />
                <span className="flex-1">{t('today.intelligence')}</span>
                <ChevronDown className="h-3.5 w-3.5 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-3 border-t border-line p-3">
                {/* Resume */}
                {resume && (resume.task || resume.conversation || resume.journal) && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-ink-faint">{t('today.resume')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {resume.task && <ResumeChip type="task" to={`/tasks?id=${resume.task.id}`} text={resume.task.title} />}
                      {resume.conversation && <ResumeChip type="conversation" to={`/chat?conv=${resume.conversation.id}`} text={resume.conversation.title} />}
                      {resume.journal && <ResumeChip type="journal" to={`/journal?entry=${resume.journal.id}`} text={resume.journal.title || t('nav.journal')} />}
                    </div>
                  </div>
                )}

                {/* Goal progress */}
                {goals.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-ink-faint">
                      <Target className="h-3 w-3" aria-hidden="true" /> {t('today.goalsProgress')}
                    </p>
                    <ul className="space-y-1.5">
                      {goals.slice(0, 4).map((g) => (
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
                  </div>
                )}

                {/* Pending link suggestions */}
                {pendingLinks.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-ink-faint">{t('related.suggestion')}</p>
                    <div className="space-y-1.5">
                      {pendingLinks.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg bg-elevated px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs text-ink">
                            {s.source_title || s.source_type} ↔ {s.target_title || s.target_type}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <Button className="!px-2 !py-0.5 text-[10px]" onClick={() => acceptLink(s.id)}>{t('related.accept')}</Button>
                            <Button variant="ghost" className="!px-2 !py-0.5 text-[10px]" onClick={() => rejectLink(s.id)}>{t('related.reject')}</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connections */}
                {connections.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-ink-faint">{t('today.connections')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {connections.slice(0, 10).map((c) => {
                        const Icon = entityIcon(c.target_type);
                        return (
                          <Link
                            key={c.id}
                            to={entityRoute(c.target_type, c.target_id)}
                            className="inline-flex items-center gap-1 rounded-pill bg-elevated px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition hover:bg-brand-soft hover:text-brand-dark"
                          >
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            {c.created_by === 'auto' && <Sparkles className="h-2.5 w-2.5 text-brand-dark" aria-hidden="true" />}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pulse + week map */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <CompactCard className="!p-2.5">
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-brand-dark">{t('today.lifePulse')}</p>
                    <LifePulse points={lifePulsePoints(data)} className="h-20" />
                  </CompactCard>
                  <CompactCard className="!p-2.5">
                    <p className="mb-1 text-[11px] font-bold text-brand-dark">{t('today.weekMap')}</p>
                    <WeeklyLifeMap />
                  </CompactCard>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <NextActionsCard className="!p-3" />
                  <DiscoveriesCard className="!p-3" />
                </div>

                <div className="flex justify-center">
                  <SurpriseButton className="!px-3 !py-1.5 text-xs" />
                </div>
              </div>
            </details>
          )}
        </div>

        {/* ---------- Side rail ---------- */}
        <div className="min-w-0 space-y-3">
          {/* حالة اليوم */}
          <SmartWidget title={t('today.safeIndicator')} icon={ShieldCheck}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex h-1.5 w-full gap-1">
                  {['stable', 'slightly-overloaded', 'overloaded'].map((lvl, idx) => (
                    <span
                      key={lvl}
                      className={`flex-1 rounded-pill ${
                        idx <= (data?.safe.level ? ['stable', 'slightly-overloaded', 'overloaded'].indexOf(data.safe.level) : 0)
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
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  {lang === 'en' ? 'Today’s load estimate — not medical advice.' : 'تقدير تنظيمي لضغط اليوم — وليس تقييمًا طبيًا.'}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-line px-2.5 py-2">
              <p className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                {hasCheckin
                  ? data?.checkin?.energy != null && data.checkin.energy <= 2
                    ? lang === 'en' ? 'Low energy — keep it light today.' : 'طاقتك منخفضة — خفّف اليوم.'
                    : lang === 'en' ? 'Checked in ✓' : 'سجّلت حالتك ✓'
                  : lang === 'en' ? 'Check in for a smarter day' : 'سجّل حالتك ليوم أذكى'}
              </p>
              {!hasCheckin && (
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => navigate('/safe')}>
                  {t('quickActions.checkin')}
                </Button>
              )}
            </div>
          </SmartWidget>

          {/* تقدم اليوم */}
          <SmartWidget title={t('today.doneToday')} icon={CheckCircle2}>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <MiniStat value={String(doneToday)} label={t('today.doneToday')} />
              <MiniStat value={`${data?.stats.focusMinutesToday ?? 0}م`} label={t('today.focusToday')} />
              <MiniStat value={String(openCount)} label={t('common.active')} />
            </div>
            <div className="mt-2">
              <ProgressBar value={dayProgress} />
            </div>
            <p className="mt-1.5 text-[10px] text-ink-faint">{lang === 'en' ? `${doneToday} of ${total} done today` : `${doneToday} من ${total} أنجزت اليوم`}</p>
          </SmartWidget>

          {/* الدراسة القادمة */}
          <SmartWidget
            title={t('today.studyDeadlines')}
            icon={GraduationCap}
            action={
              <Link to="/study" className="flex items-center gap-0.5 text-[11px] font-bold text-brand-dark hover:underline" aria-label={t('nav.study')}>
                {t('nav.study')} <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          >
            {exams.length === 0 ? (
              <p className="py-0.5 text-[12px] text-ink-faint">{lang === 'en' ? 'Nothing scheduled — enjoy the calm.' : 'لا مواعيد قادمة — استمتع بالهدوء.'}</p>
            ) : (
              <ul className="space-y-1">
                {exams.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link to="/study" className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-elevated">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{e.title}</span>
                      <span className="shrink-0 text-[11px] font-bold text-warn">{e.exam_date}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {openTasks.length > 0 && <StudyCta openTasks={openTasks} />}
          </SmartWidget>

          {/* اقتراح المساعد الذكي */}
          {!calm && (
            <CompactCard className="gradient-border relative overflow-hidden">
              <span className="pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full bg-brand-soft/80 blur-2xl" aria-hidden="true" />
              <div className="relative">
                <div className="mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-brand-dark" aria-hidden="true" />
                  <h3 className="text-xs font-bold text-ink">{t('today.aiSuggestion')}</h3>
                  {suggestion && (
                    <span className="ms-auto">
                      <SpeakButton text={suggestion} className="!h-6 !w-6" />
                    </span>
                  )}
                </div>
                {suggesting && !suggestion ? (
                  <p className="flex items-center gap-2 py-1 text-[12px] text-ink-faint">
                    <Spinner className="h-3.5 w-3.5" /> {t('today.suggestion')}
                  </p>
                ) : suggestion ? (
                  <p className="text-[13px] leading-relaxed text-ink">{suggestion}</p>
                ) : (
                  <p className="py-1 text-[12px] text-ink-faint">{suggestionError || t('dash.empty')}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                  <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => planDay.run()} disabled={planDay.loading}>
                    <Wand2 className="h-3 w-3" /> {t('ai.planDay')}
                  </Button>
                  <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => suggest()} disabled={suggesting}>
                    <Sparkles className="h-3 w-3" /> {t('ai.another')}
                  </Button>
                  <Link to="/chat" className="ms-auto">
                    <Button className="!px-2 !py-1 text-[11px]">
                      <MessageCircle className="h-3 w-3" /> {t('quickActions.chat')}
                    </Button>
                  </Link>
                </div>
                <AiResultBox loading={planDay.loading} result={planDay.result} compact />
              </div>
            </CompactCard>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="rounded-lg bg-elevated px-1 py-1.5">
      <span className="block truncate text-sm font-extrabold text-ink" dir="auto">{value}</span>
      <span className="block truncate text-[10px] text-ink-faint">{label}</span>
    </span>
  );
}

/** Small smart hint that links to the study flow when tasks are study-related. */
function StudyCta({ openTasks }: { openTasks: TodayData['tasks'] }) {
  const t = useT();
  const courseTasks = openTasks.filter((x) => x.course_id).length;
  if (courseTasks === 0) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-brand-soft/60 px-2 py-1.5 text-[11px] text-brand-dark">
      <Lightbulb className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t('dash.sug.study')}
    </p>
  );
}

function ResumeChip({ type, to, text }: { type: string; to: string; text: string }) {
  const icons = { task: ListTodo, conversation: History, journal: BookOpen } as const;
  const Icon = icons[type as keyof typeof icons] || Sparkles;
  return (
    <Link to={to} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 text-[12px] text-ink transition hover:shadow-card">
      <Icon className="h-3.5 w-3.5 shrink-0 text-brand-dark" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </Link>
  );
}

/** The day's rhythm across real dimensions for LifePulse. */
function lifePulsePoints(data: TodayData | null) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const goalsAvg = data?.intelligence?.goals?.length
    ? data.intelligence.goals.reduce((s, g) => s + (g.progress ?? 0), 0) / data.intelligence.goals.length
    : 0;
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
