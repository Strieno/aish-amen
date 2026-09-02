import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BatteryLow,
  BookOpen,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock,
  GraduationCap,
  Heart,
  History,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  Moon,
  Plus,
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
import CommandBar from '../components/CommandBar';
import { LifePulse, WeeklyLifeMap } from '../components/visualizations';
import NextActionsCard from '../components/gamification/NextActionsCard';
import DiscoveriesCard from '../components/gamification/DiscoveriesCard';
import SurpriseButton from '../components/gamification/SurpriseButton';
import { useProgressStore } from '../components/gamification/progress-store';
import { useAiAction } from '../lib/useAiAction';
import { entityIcon, entityRoute } from '../lib/entity-utils';
import { primeSpeechPlayback, speakAutomatically } from '../lib/speech';
import { localDateKey } from '../lib/date';
import { rankDay, groupDayTasks, lightTasks, DAY_TIER_LIMIT, type DayTier, type RankedTask } from '../lib/priority';
import { computeAdaptive } from '../lib/adaptive';

const LEVEL_LABEL: Record<string, string> = {
  stable: 'today.stable',
  'slightly-overloaded': 'today.slightly',
  overloaded: 'today.overloaded',
};

const TIER_DOT: Record<DayTier, string> = { now: 'bg-danger', today: 'bg-warn', later: 'bg-brand-accent', optional: 'bg-ink-faint' };
const TIER_LABEL: Record<DayTier, string> = { now: 'prio.now', today: 'prio.today', later: 'prio.later', optional: 'prio.optional' };

/* ---------- Widget config (localStorage, hideable) ---------- */
const WIDGET_IDS = ['next', 'progress', 'energy', 'exam', 'note', 'focus', 'week', 'study'] as const;
type WidgetId = (typeof WIDGET_IDS)[number];
const WIDGET_DEFAULTS: WidgetId[] = ['next', 'progress', 'energy', 'exam'];
const WIDGET_LABEL: Record<WidgetId, string> = {
  next: 'widget.next',
  progress: 'widget.progress',
  energy: 'widget.energy',
  exam: 'widget.exam',
  note: 'widget.note',
  focus: 'widget.focus',
  week: 'widget.week',
  study: 'widget.study',
};

function loadWidgets(): WidgetId[] {
  try {
    const raw = localStorage.getItem('aish.widgets.v1');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return WIDGET_IDS.filter((id) => list.includes(id));
    }
  } catch { /* fall through to defaults */ }
  return WIDGET_DEFAULTS;
}
function saveWidgets(list: WidgetId[]) {
  try {
    localStorage.setItem('aish.widgets.v1', JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

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
  const [calm, setCalm] = useState(() => {
    const h = new Date().getHours();
    return h >= 22 || h < 5; // late night starts calm
  });
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [suggestionError, setSuggestionError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [newEvent, setNewEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [widgets, setWidgets] = useState<WidgetId[]>(loadWidgets);
  const [widgetMenu, setWidgetMenu] = useState(false);
  const planDay = useAiAction('plan-day');
  const nextTask = useAiAction('next-task');
  const lastSpokenSuggestion = useRef('');
  const progress = useProgressStore((s) => s.snapshot);
  const setPanelOpen = useProgressStore((s) => s.setPanelOpen);

  const todayStr = localDateKey();
  const now = new Date();
  const hour = now.getHours();

  const adaptive = useMemo(() => computeAdaptive(data), [data]);
  const ranked = useMemo(() => {
    if (!data?.tasks) return [];
    return rankDay(data.tasks, todayStr, { energy: adaptive.energy, hour, examDays: adaptive.examDays });
  }, [data, todayStr, adaptive.energy, adaptive.examDays, hour]);
  const groups = useMemo(() => groupDayTasks(ranked), [ranked]);
  const lights = useMemo(() => lightTasks(data?.tasks ?? []), [data]);

  const exams = data?.intelligence?.study?.exams || [];
  const goals = data?.intelligence?.goals || [];
  const resume = data?.intelligence?.resume;
  const pendingLinks = data?.intelligence?.pendingLinks || [];
  const connections = data?.intelligence?.connections || [];
  const openCount = ranked.length;
  const doneToday = data?.stats.doneToday ?? 0;
  const total = openCount + doneToday;
  const dayProgress = total > 0 ? Math.round((doneToday / total) * 100) : 0;
  const hasCheckin = Boolean(data?.checkin);

  const hint = useMemo(() => {
    if (!data) return '';
    if (adaptive.lateNight) return t('dash.night');
    if (ranked.length === 0 && doneToday === 0) return t('dash.sug.noTasks');
    if (adaptive.examSoon && adaptive.examTitle) return t('dash.sug.study');
    if (!hasCheckin) return t('dash.sug.noCheckin');
    if (adaptive.lowEnergy) return t('dash.sug.lowEnergy');
    return t('dash.sug.whatNow');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ranked.length, doneToday, hasCheckin, adaptive.lateNight, adaptive.lowEnergy, adaptive.examSoon, adaptive.examTitle, t]);

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

  useEffect(() => {
    suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!suggestion || suggestion === lastSpokenSuggestion.current) return;
    lastSpokenSuggestion.current = suggestion;
    void speakAutomatically(suggestion);
  }, [suggestion]);

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

  const toggleWidget = (id: WidgetId) => {
    setWidgets((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      saveWidgets(next);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
        <Skeleton className="h-10 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-card" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-3 md:col-span-2" aria-hidden="true">
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="h-36 w-full rounded-card" />
          </div>
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* ===== Hero: greeting + adaptive status ===== */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-card/70 px-3 py-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-extrabold leading-tight text-ink">{greeting(hour, lang)}</span>
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
            <StatusChip tone={data?.safe.level === 'overloaded' ? 'danger' : data?.safe.level === 'slightly-overloaded' ? 'warn' : 'brand'}>
              {t(LEVEL_LABEL[data?.safe.level || 'stable'])}
            </StatusChip>
            {adaptive.lowEnergy && (
              <StatusChip tone="warn">
                <BatteryLow className="h-3 w-3" aria-hidden="true" /> {t('dash.lowEnergyTitle')}
              </StatusChip>
            )}
            {adaptive.lateNight && <StatusChip tone="neutral"><Moon className="h-3 w-3" aria-hidden="true" /> {t('dash.night')}</StatusChip>}
            {data?.nextEvent && (
              <span className="inline-flex items-center gap-1 text-ink-soft">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span dir="ltr">{data.nextEvent.start.slice(11, 16)}</span> {data.nextEvent.title}
              </span>
            )}
          </p>
        </div>
        <div className="relative flex shrink-0 items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => setWidgetMenu((v) => !v)}
            className="btn-icon"
            aria-label={t('widget.customize')}
            title={t('widget.customize')}
            aria-expanded={widgetMenu}
          >
            <LayoutDashboard className="h-4 w-4" />
          </button>
          {widgetMenu && (
            <div className="absolute end-0 top-11 z-40 w-56 rounded-xl border border-line bg-card p-2 shadow-card-hover animate-fadeIn" role="menu" aria-label={t('widget.title')}>
              <p className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{t('widget.title')}</p>
              {WIDGET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={widgets.includes(id)}
                  onClick={() => toggleWidget(id)}
                  className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-lg px-2 text-start text-xs font-semibold transition ${
                    widgets.includes(id) ? 'text-brand-dark' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  <span className="truncate">{t(WIDGET_LABEL[id])}</span>
                  <span className={`shrink-0 text-[10px] ${widgets.includes(id) ? 'text-brand-dark' : 'text-ink-faint'}`}>
                    {widgets.includes(id) ? t('widget.hide') : t('widget.show')}
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => setWidgetMenu(false)} className="mt-1 w-full rounded-lg bg-elevated px-2 py-1.5 text-center text-[11px] font-bold text-ink-soft hover:text-ink">
                {t('widget.done')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== Command bar ===== */}
      <CommandBar urgentOnly={urgentOnly} onUrgentOnly={setUrgentOnly} onCalm={setCalm} />

      {/* ===== Deadline banner ===== */}
      {adaptive.examSoon && adaptive.examTitle && !calm && (
        <SmartSuggestion
          tone="warn"
          text={`${t('dash.deadlineSoon')}: ${adaptive.examTitle} — ${adaptive.examDays === 0 ? t('dash.examToday') : `${adaptive.examDays} ${lang === 'en' ? 'd' : 'يوم'}`}`}
          actions={
            <Link to="/study">
              <Button className="!px-2.5 !py-1 text-[11px]">{t('nav.study')}</Button>
            </Link>
          }
        />
      )}

      <div className="grid items-start gap-3 lg:grid-cols-3">
        {/* ---------- Main column ---------- */}
        <div className="min-w-0 space-y-2.5 lg:col-span-2">
          {/* Smart contextual suggestion */}
          <SmartSuggestion
            text={hint}
            actions={
              <>
                <Button variant="ghost" className="!px-2.5 !py-1 text-[11px]" onClick={() => nextTask.run()} disabled={nextTask.loading}>
                  <Wand2 className="h-3 w-3" /> {t('dash.sug.whatNow')}
                </Button>
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => navigate(openCount ? '/tasks' : '/tasks?new=1')}>
                  {t(openCount ? 'nav.tasks' : 'quickActions.task')}
                </Button>
              </>
            }
          />

          {/* Quick actions — everything is one tap */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t('quickActions.title')}>
            <QuickAction label={t('quickActions.task')} icon={Plus} onClick={() => openQuick('task')} />
            <QuickAction label={t('quickActions.note')} icon={BookOpen} onClick={() => openQuick('journal')} />
            <QuickAction label={t('quickActions.gratitude')} icon={Heart} onClick={() => openQuick('gratitude')} />
            <QuickAction label={t('quickActions.focus')} icon={Timer} onClick={() => navigate('/focus')} />
            <QuickAction label={t('quickActions.checkin')} icon={CheckCircle2} tone="brand" onClick={() => navigate('/safe')} />
          </div>

          {/* ===== Adaptive priority groups: Now / Today / Later ===== */}
          <CompactCard className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <ListTodo className="h-3.5 w-3.5 text-brand-dark" aria-hidden="true" /> {t('today.tasks')}
              </h2>
              <div className="flex items-center gap-1.5">
                {openCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setUrgentOnly((v) => !v)}
                    aria-pressed={urgentOnly}
                    className={`chip cursor-pointer !px-2 !text-[10px] ${urgentOnly ? '!bg-brand !text-white' : ''}`}
                  >
                    {urgentOnly ? t('dash.showAll') : t('dash.urgentOnly')}
                  </button>
                )}
                <Link to="/tasks" className="flex items-center gap-0.5 text-[11px] font-bold text-brand-dark hover:underline" aria-label={t('common.all')}>
                  {t('common.all')} <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>

            {openCount === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                <p className="text-[13px] text-ink-soft">{t('prio.empty')}</p>
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => openQuick('task')}>
                  <Plus className="h-3 w-3" /> {t('quickActions.task')}
                </Button>
              </div>
            ) : (
              <>
                {/* Light-task nudge when energy is low */}
                {adaptive.lowEnergy && lights.length > 0 && !urgentOnly && (
                  <div className="rounded-lg bg-warn-bg/60 px-2.5 py-1.5">
                    <p className="mb-1 text-[10px] font-bold text-warn">{t('prio.lightHint')}</p>
                    <div className="flex flex-wrap gap-1">
                      {lights.slice(0, 2).map((task) => (
                        <Link key={task.id} to={`/tasks?id=${task.id}`} className="rounded-pill bg-card px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:text-brand-dark">
                          {task.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {(urgentOnly ? [['now', groups.now] as const] : ([['now', groups.now], ['today', groups.today], ['later', groups.later]] as const)).map(([tier, list]) => (
                  <TaskGroup key={tier} tier={tier} list={list.slice(0, DAY_TIER_LIMIT[tier])} />
                ))}
                {urgentOnly && groups.now.length === 0 && (
                  <p className="py-1 text-[13px] text-ink-soft">{t('dash.noUrgent')}</p>
                )}
                {!urgentOnly && groups.optional.length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-bold text-ink-faint transition hover:text-ink">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                      {t('prio.optional')} +{groups.optional.length}
                    </summary>
                    <div className="mt-1">
                      <TaskGroup tier="optional" list={groups.optional.slice(0, 5)} />
                    </div>
                  </details>
                )}
                {total > 0 && (
                  <div className="flex items-center gap-2 border-t border-line pt-2">
                    <div className="min-w-0 flex-1">
                      <ProgressBar value={dayProgress} />
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-ink-soft">{doneToday}/{total}</span>
                  </div>
                )}
              </>
            )}
          </CompactCard>

          {/* Schedule */}
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

          {/* الذكاء والتفاصيل (collapsed by default) */}
          {!calm && (
            <details className="group rounded-card border border-line bg-card/60">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold text-ink-soft transition hover:bg-elevated/60 hover:text-ink">
                <Sparkles className="h-3.5 w-3.5 text-brand-dark" aria-hidden="true" />
                <span className="flex-1">{t('today.intelligence')}</span>
                <ChevronDown className="h-3.5 w-3.5 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-3 border-t border-line p-3">
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

        {/* ---------- Side rail: configurable widgets + AI ---------- */}
        <div className="min-w-0 space-y-2.5">
          {widgets.includes('next') && <NextTaskWidget ranked={ranked} />}
          {widgets.includes('progress') && (
            <SmartWidget title={t('widget.progress')} icon={CheckCircle2}>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <MiniStat value={String(doneToday)} label={t('today.doneToday')} />
                <MiniStat value={`${data?.stats.focusMinutesToday ?? 0}م`} label={t('today.focusToday')} />
                <MiniStat value={String(openCount)} label={t('common.active')} />
              </div>
              <div className="mt-2">
                <ProgressBar value={dayProgress} />
              </div>
            </SmartWidget>
          )}
          {widgets.includes('energy') && <EnergyWidget data={data} hasCheckin={hasCheckin} />}
          {widgets.includes('exam') && <ExamWidget exams={exams} examDays={adaptive.examDays} />}
          {widgets.includes('note') && <QuickNoteWidget />}
          {widgets.includes('focus') && (
            <SmartWidget title={t('widget.focus')} icon={Timer}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-ink-soft">
                  {data?.stats.focusMinutesToday ?? 0} {lang === 'en' ? 'min today' : 'دقيقة اليوم'}
                </p>
                <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => navigate('/focus')}>
                  <Timer className="h-3 w-3" /> {t('focus.start')}
                </Button>
              </div>
            </SmartWidget>
          )}
          {widgets.includes('week') && <WeekWidget />}
          {widgets.includes('study') && <StudyWidget />}

          {/* AI suggestion */}
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
                  <Button className="ms-auto !px-2 !py-1 text-[11px]" onClick={() => navigate('/chat')}>
                    <MessageCircle className="h-3 w-3" /> {t('quickActions.chat')}
                  </Button>
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

/* ================= Task groups ================= */

function TaskGroup({ tier, list }: { tier: DayTier; list: RankedTask[] }) {
  const t = useT();
  if (list.length === 0) return null;
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[tier]}`} aria-hidden="true" />
        {t(TIER_LABEL[tier])}
      </p>
      <ul className="divide-y divide-line">
        {list.map(({ task, overdueDays, daysUntilDue }) => (
          <li key={task.id}>
            <Link to={`/tasks?id=${task.id}`} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-elevated">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{task.title}</span>
              {overdueDays > 0 ? (
                <span className="shrink-0 text-[10px] font-bold text-danger">-{overdueDays}d</span>
              ) : daysUntilDue !== null && daysUntilDue <= 3 ? (
                <span className="shrink-0 text-[10px] font-semibold text-warn">+{daysUntilDue}d</span>
              ) : null}
              {task.energy === 'low' ? <span className="shrink-0 text-[10px] text-ink-faint">⚡</span> : task.energy === 'high' ? <span className="shrink-0 text-[10px] text-ink-faint">🔥</span> : null}
              {Number(task.est_minutes) ? <span className="shrink-0 text-[10px] text-ink-faint">{task.est_minutes}د</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================= Widgets ================= */

function NextTaskWidget({ ranked }: { ranked: RankedTask[] }) {
  const t = useT();
  const top = ranked[0];
  return (
    <SmartWidget title={t('widget.next')} icon={Sparkles}>
      {top ? (
        <Link to={`/tasks?id=${top.task.id}`} className="block rounded-lg border border-brand-lighter/60 bg-brand-soft/30 px-2.5 py-2 transition hover:shadow-card">
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-brand-dark">
            <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[top.tier]}`} aria-hidden="true" />
            {t(TIER_LABEL[top.tier])}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-ink">{top.task.title}</p>
        </Link>
      ) : (
        <p className="py-1 text-[12px] text-ink-faint">{t('prio.empty')}</p>
      )}
    </SmartWidget>
  );
}

function EnergyWidget({ data, hasCheckin }: { data: TodayData | null; hasCheckin: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useAppStore((s) => s.settings.language);
  const energy = data?.checkin?.energy ?? null;
  return (
    <SmartWidget title={t('widget.energy')} icon={BatteryLow}>
      {hasCheckin ? (
        <>
          <div className="flex items-center gap-1" aria-label={`${energy ?? '?'}/5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={`h-1.5 flex-1 rounded-pill ${energy != null && n <= energy ? 'bg-brand-accent' : 'bg-line'}`} aria-hidden="true" />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {data?.checkin?.stress != null
              ? `${t('checkin.stress')}: ${data.checkin.stress}/5${data.checkin.sleep_hours != null ? ` · ${t('checkin.sleep')}: ${data.checkin.sleep_hours}h` : ''}`
              : t('today.checkin')}
          </p>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 py-0.5">
          <p className="text-[12px] text-ink-soft">{lang === 'en' ? 'Check in for a smarter day' : 'سجّل حالتك ليوم أذكى'}</p>
          <Button className="!px-2.5 !py-1 text-[11px]" onClick={() => navigate('/safe')}>{t('quickActions.checkin')}</Button>
        </div>
      )}
    </SmartWidget>
  );
}

function ExamWidget({ exams, examDays }: { exams: NonNullable<TodayData['intelligence']>['study']['exams']; examDays: number | null }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  if (exams.length === 0) {
    return (
      <SmartWidget title={t('widget.exam')} icon={GraduationCap}>
        <p className="py-0.5 text-[12px] text-ink-faint">{t('widget.noExam')}</p>
      </SmartWidget>
    );
  }
  const e = exams[0];
  return (
    <SmartWidget
      title={t('widget.exam')}
      icon={GraduationCap}
      action={
        <Link to="/study" className="text-[11px] font-bold text-brand-dark hover:underline" aria-label={t('nav.study')}>
          {t('life.open')}
        </Link>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{e.title}</span>
        <StatusChip tone={examDays != null && examDays <= 3 ? 'danger' : 'warn'}>
          {examDays === 0 ? t('dash.examToday') : examDays != null ? `${examDays} ${lang === 'en' ? 'd' : 'يوم'}` : e.exam_date}
        </StatusChip>
      </div>
    </SmartWidget>
  );
}

function QuickNoteWidget() {
  const t = useT();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (!text.trim()) return;
    await api.post('/journal', { title: text.trim().slice(0, 40), content: text.trim(), entry_date: localDateKey(), tags: [], mood: null, ai_access: true });
    setText('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };
  return (
    <SmartWidget title={t('widget.note')} icon={BookOpen}>
      <textarea
        className="input min-h-12 resize-y !px-2 !py-1.5 text-[12px]"
        placeholder={t('widget.emptyNote')}
        aria-label={t('widget.note')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        {saved ? <span className="text-[11px] font-bold text-ok">✓ {t('common.saved')}</span> : <span className="text-[10px] text-ink-faint">Ctrl+Enter</span>}
        <Button className="!px-2 !py-0.5 text-[10px]" onClick={save} disabled={!text.trim()}>{t('common.save')}</Button>
      </div>
    </SmartWidget>
  );
}

function WeekWidget() {
  const t = useT();
  const snapshot = useProgressStore((s) => s.snapshot);
  if (!snapshot) return null;
  const { streaks, xp } = snapshot;
  return (
    <SmartWidget title={t('widget.week')} icon={CheckCircle2}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-extrabold leading-none text-ink" dir="ltr">{xp} XP</span>
        <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
          {streaks.activity >= 3 && <StatusChip tone="brand">🔥 {streaks.activity}</StatusChip>}
          {streaks.study >= 2 && <StatusChip tone="brand">📘 {streaks.study}</StatusChip>}
          {streaks.focus >= 2 && <StatusChip tone="brand">⏱ {streaks.focus}</StatusChip>}
          {streaks.journal >= 2 && <StatusChip tone="brand">✍️ {streaks.journal}</StatusChip>}
        </div>
      </div>
    </SmartWidget>
  );
}

function StudyWidget() {
  const t = useT();
  const { data } = useApi<{ weekMinutes: number; weeklyProgress: number; streak: number }>('/study/dashboard');
  return (
    <SmartWidget
      title={t('widget.study')}
      icon={GraduationCap}
      action={
        <Link to="/study" className="text-[11px] font-bold text-brand-dark hover:underline" aria-label={t('nav.study')}>
          {t('life.open')}
        </Link>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{(data?.weekMinutes ?? 0)}د</span>
        {data?.streak ? <StatusChip tone="brand">🔥 {data.streak}</StatusChip> : null}
      </div>
      <div className="mt-1.5">
        <ProgressBar value={data?.weeklyProgress ?? 0} />
      </div>
    </SmartWidget>
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
