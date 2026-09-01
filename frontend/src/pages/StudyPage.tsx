import { useEffect, useMemo, useState } from 'react';
import { BookMarked, CalendarClock, Plus, Search, Sparkles, Target, Timer, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { normalizeCourseDetail, type CourseDetail, type CourseSummary, type StudyDashboard } from '../lib/study-types';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { PageBackdrop, celebrate } from '../components/visualizations';
import SessionFlow from './study/SessionFlow';
import CourseCockpit from './study/CourseCockpit';
import PracticeEngine from './study/PracticeEngine';
import FlashcardsView from './study/FlashcardsView';
import MistakesView from './study/MistakesView';
import AnalyticsView from './study/AnalyticsView';

type Tab = 'overview' | 'courses' | 'plan' | 'practice' | 'review' | 'analytics';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء الهدوء';
}

function StudyBookArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" className={className} role="img" aria-label="كتاب مفتوح">
      <path d="M48 14 C 40 8, 26 8, 14 12 L14 52 C 28 46, 40 48, 48 56 C 56 48, 68 46, 82 52 L82 12 C 70 8, 56 8, 48 14 Z" fill="rgb(var(--brand-soft))" stroke="rgb(var(--brand) / 0.5)" strokeWidth="1.5" />
      <path d="M48 16 L48 54" stroke="rgb(var(--brand) / 0.5)" strokeWidth="1.5" />
    </svg>
  );
}

export default function StudyPage() {
  const t = useT();
  const { data: dash, refetch: refetchDash } = useApi<StudyDashboard>('/study/dashboard');
  const { data: courses, loading, refetch } = useApi<CourseSummary[]>('/courses');
  const { data: exams } = useApi<{ id: string; title: string; exam_date?: string; course_name?: string; readiness?: { ready: number; daysLeft: number | null } }[]>('/exams');
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [showCourse, setShowCourse] = useState(false);
  const [q, setQ] = useState('');
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [weekMinutes, setWeekMinutes] = useState(240);
  const [weekDone, setWeekDone] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credit, setCredit] = useState('3');
  const [instructor, setInstructor] = useState('');
  const [semester, setSemester] = useState('');

  const selected = (courses || []).find((c) => c.id === selectedId) || (courses || [])[0];

  const loadDetail = async (courseId?: string | null) => {
    const id = courseId || selected?.id;
    if (!id) {
      setDetail(null);
      return;
    }
    const d = await api.get<CourseDetail | null>(`/courses/${id}`);
    setDetail(d ? normalizeCourseDetail(d) : null);
  };

  useEffect(() => {
    if (selected?.id) loadDetail(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const topicsByCourse = (courseId: string) => (detail?.id === courseId ? detail.topics || [] : []);

  const addCourse = async () => {
    await api.post('/courses', { name, code: code || null, credit_hours: Number(credit) || 3, instructor: instructor || null, semester: semester || null });
    setName(''); setCode(''); setCredit('3'); setInstructor(''); setSemester('');
    setShowCourse(false);
    refetch();
    refetchDash();
    celebrate({ text: 'مادة جديدة' });
  };

  const searchResults = useMemo(() => {
    if (!q.trim()) return [];
    const term = q.toLowerCase();
    const out: { type: string; id: string; title: string; sub?: string }[] = [];
    (courses || []).filter((c) => c.name.toLowerCase().includes(term)).forEach((c) => out.push({ type: 'course', id: c.id, title: c.name, sub: c.code || '' }));
    (exams || []).filter((e) => e.title.toLowerCase().includes(term)).forEach((e) => out.push({ type: 'exam', id: e.id, title: e.title, sub: `${e.course_name || ''} ${e.exam_date || ''}` }));
    return out.slice(0, 8);
  }, [q, courses, exams]);

  const momentum = dash?.momentum;

  return (
    <div className="relative isolate space-y-4">
      <PageBackdrop variant="study" />

      {/* ===== Header ===== */}
      <PageHeader title="Study OS" subtitle="مركز قيادتك الأكاديمية الشخصي">
        <SessionFlow courses={courses || []} topicsByCourse={topicsByCourse} onOpenTutor={() => { setTab('courses'); setSelectedId((courses || [])[0]?.id || null); }} />
        <Button variant="ghost" className="!px-3" onClick={() => setShowCourse(true)}><Plus className="h-4 w-4" /> {t('study.addCourse')}</Button>
      </PageHeader>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint rtl:right-3 ltr:left-3" />
        <input className="input ps-9" placeholder="ابحث في المواد والامتحانات..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الدراسة" />
        {searchResults.length > 0 && (
          <div className="card absolute inset-x-0 top-full z-20 mt-1 p-1.5 animate-fadeIn">
            {searchResults.map((r) => (
              <button key={`${r.type}-${r.id}`} className="menu-item" onClick={() => { setSelectedId(r.id); setTab('courses'); setQ(''); }}>
                <BookMarked className="h-4 w-4" /> <span className="truncate">{r.title}</span> <span className="ms-auto text-xs text-ink-faint">{r.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===== Tabs ===== */}
      <div className="flex flex-wrap gap-1.5">
        {(['overview', 'courses', 'plan', 'practice', 'review', 'analytics'] as Tab[]).map((tb) => (
          <button key={tb} type="button" onClick={() => setTab(tb)} className={`chip cursor-pointer ${tab === tb ? 'bg-brand text-white' : ''}`}>
            {tb === 'overview' ? 'نظرة عامة' : tb === 'courses' ? 'موادي' : tb === 'plan' ? 'الخطة' : tb === 'practice' ? 'الممارسة' : tb === 'review' ? 'المراجعة' : 'التحليلات'}
          </button>
        ))}
      </div>

      {/* ===== Overview / Command Center ===== */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Hero */}
          <div className="hero-gradient relative overflow-hidden rounded-card border border-brand-lighter/60 p-4 shadow-card animate-riseIn">
            <div className="relative z-10">
              <p className="text-xl font-extrabold leading-tight text-ink md:text-2xl">{greeting()} 👋</p>
              <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-ink-soft">
                <span>لديك <b className="text-ink">{dash?.coursesCount ?? 0} مواد</b></span>
                {dash?.nextExam && <span>• أقرب اختبار: <b className="text-warn">{dash.nextExam.title}</b> ({dash.nextExam.exam_date})</span>}
                {dash?.streak ? <span>• <b className="text-ink">{dash.streak} أيام</b> متتالية 🔥</span> : null}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="chip !bg-card/70">درست هذا الأسبوع: <b className="text-ink">{dash?.weekMinutes ?? 0} دقيقة</b></span>
                <span className="chip !bg-card/70">التقدم الأسبوعي: <b className="text-ink">{dash?.weeklyProgress ?? 0}%</b></span>
                {dash?.recommendations?.[0] && (
                  <span className="chip !bg-brand-soft !text-brand-dark">
                    <Target className="h-3 w-3" /> الأولوية: {dash.recommendations[0].title}
                  </span>
                )}
              </div>
              {dash?.recommendedToday ? (
                <p className="mt-2.5 text-[13px] text-ink-soft">اقتراح اليوم: <b className="text-brand-dark">{dash.recommendedToday} دقيقة دراسة</b></p>
              ) : null}
            </div>
          </div>

          {/* Momentum + quick recommendation */}
          {momentum && (
            <Card hover className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-brand-dark">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-bold">الزخم الأكاديمي: {momentum.level}</span>
                  <Badge tone={momentum.trend === 'down' ? 'warn' : 'ok'}>
                    {momentum.trend === 'up' ? '↑ في تحسن' : momentum.trend === 'down' ? '↓ يحتاج عودة' : '→ ثابت'}
                  </Badge>
                </div>
                <p className="text-xs text-ink-faint">{momentum.explanation}</p>
              </div>
            </Card>
          )}

          {/* Bento grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {/* Today plan */}
            <Card className="!p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Timer className="h-4 w-4 text-brand-dark" /> خطتي اليوم</p>
                <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => setTab('plan')}>عرض الخطة</Button>
              </div>
              {(dash?.plan?.items || []).length ? (
                <ul className="space-y-1.5">
                  {dash!.plan.items.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg bg-elevated/60 px-3 py-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-danger' : item.priority === 'medium' ? 'bg-warn' : 'bg-brand-accent'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                        <p className="truncate text-[11px] text-ink-faint">{item.courseName}{item.reason ? ` — ${item.reason}` : ''}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-brand-dark">{item.minutes}د</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState text="لا توجد خطة بعد — أضف مواضيع وامتحانات لتظهر خطة ذكية." />
              )}
            </Card>

            {/* Next exam readiness */}
            <Card className="!p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><CalendarClock className="h-4 w-4 text-brand-dark" /> أقرب اختبار</p>
              {dash?.nextExam ? (
                <div>
                  <p className="text-sm font-semibold text-ink">{dash.nextExam.title}</p>
                  <p className="text-xs text-ink-faint">{dash.nextExam.course_name} • {dash.nextExam.exam_date}</p>
                  {dash.examReadiness && (
                    <div className="mt-2">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-ink-soft">جاهزية</span>
                        <span className="font-bold text-brand-dark">{dash.examReadiness.ready}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-pill bg-line">
                        <div className="h-full rounded-pill bg-brand-accent transition-all duration-700" style={{ width: `${dash.examReadiness.ready}%` }} />
                      </div>
                      <p className="mt-1.5 text-[11px] text-ink-faint">باقي {dash.examReadiness.daysLeft ?? '—'} يوم • يوصى بـ {dash.examReadiness.recommendedMinutes ?? '—'} دقيقة مراجعة</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState text="لا توجد اختبارات قادمة." />
              )}
            </Card>

            {/* Weak areas */}
            <Card className="!p-4">
              <p className="mb-2 text-sm font-bold text-ink">نقاط تحتاج اهتمام</p>
              {(dash?.weakAreas || []).length ? (
                <ul className="space-y-1.5">
                  {dash!.weakAreas.slice(0, 4).map((w) => (
                    <li key={w.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-ink">{w.title} <span className="text-ink-faint">({w.course_name})</span></span>
                      <span className="chip !bg-warn-bg !text-warn">{w.mastery}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState text="لا توجد نقاط ضعف مسجلة بعد." />
              )}
            </Card>

            {/* AI recommendation */}
            <Card className="gradient-border relative overflow-hidden !p-4 lg:col-span-2">
              <span className="pointer-events-none absolute -end-8 -top-8 h-28 w-28 rounded-full bg-brand-soft/70 blur-2xl" />
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><Sparkles className="h-4 w-4 text-brand-dark" /> ماذا أدرس الآن؟</p>
              {(dash?.recommendations || []).length ? (
                <ul className="space-y-2">
                  {dash!.recommendations.slice(0, 3).map((rec) => (
                    <li key={rec.topicId} className="rounded-xl bg-elevated/70 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-ink">{rec.title} <span className="text-xs text-ink-faint">({rec.courseName})</span></p>
                        <Badge tone={rec.mastery >= 65 ? 'ok' : rec.mastery >= 45 ? 'brand' : 'warn'}>{rec.mastery}%</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-faint">{rec.reasons.join(' • ')}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState text="أضف مواضيع وابدأ ممارسة لتحصل على توصيات مبنية على بياناتك." />
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ===== Courses ===== */}
      {tab === 'courses' && (
        loading ? <Spinner className="mx-auto my-10 block h-7 w-7" /> : (courses || []).length === 0 ? (
          <EmptyState text={t('study.noCourses')} art={<StudyBookArt />} action={<Button onClick={() => setShowCourse(true)}><Plus className="h-4 w-4" /> {t('study.addCourse')}</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(courses || []).map((c) => (
              <button key={c.id} type="button" onClick={() => { setSelectedId(c.id); loadDetail(c.id); }} className={`card card-hover p-4 text-start ${selected?.id === c.id ? 'border-brand' : ''}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark"><BookMarked className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                      <p className="truncate text-[11px] text-ink-faint">{c.code || c.semester || c.instructor || '—'}</p>
                    </div>
                  </div>
                </div>
                <div className="mb-2 flex items-center gap-2 text-xs text-ink-faint">
                  <span>ساعات: {c.study_hours ?? 0}</span>
                  <span>• مواضيع: {c.topics_done ?? 0}/{c.topics_count ?? 0}</span>
                  {(c.upcoming_exams ?? 0) > 0 && <Badge tone="warn">{c.upcoming_exams} اختبار</Badge>}
                </div>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-ink-faint">الإتقان</span>
                  <span className="font-bold text-brand-dark">{c.mastery_avg ?? 0}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-line">
                  <div className="h-full rounded-pill bg-brand-accent transition-all duration-500" style={{ width: `${c.mastery_avg ?? 0}%` }} />
                </div>
                {c.next_exam && <p className="mt-2 text-[11px] text-warn">📅 {c.next_exam} — {c.next_exam_date}</p>}
              </button>
            ))}
          </div>
        )
      )}

      {/* Course cockpit */}
      {tab === 'courses' && detail && (
        <div className="rounded-card border border-line bg-card/60 p-4 md:p-5">
          <CourseCockpit
            detail={detail}
            onRefetch={() => { loadDetail(detail.id); refetch(); refetchDash(); }}
          />
        </div>
      )}

      {/* ===== Plan ===== */}
      {tab === 'plan' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">خطتي</h2>
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setShowWeekModal(true)}><Sparkles className="h-3.5 w-3.5" /> أنشئ خطتي الأسبوعية</Button>
          </div>
          <TodayPlanView onStart={() => setTab('practice')} />
        </div>
      )}

      {/* ===== Practice ===== */}
      {tab === 'practice' && (
        <Card className="!p-4">
          <p className="mb-3 text-sm font-bold text-ink">ممارسة تكيّفية — اختر موضوعًا أو اكتب مفهومًا</p>
          <PracticeEngine courseId={selected?.id} topicId={detail?.topics?.[0]?.id} topicTitle={detail?.topics?.[0]?.title || 'مفهوم عام'} />
        </Card>
      )}

      {/* ===== Review ===== */}
      {tab === 'review' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="!p-4"><FlashcardsView /></Card>
          <Card className="!p-4"><MistakesView /></Card>
        </div>
      )}

      {/* ===== Analytics ===== */}
      {tab === 'analytics' && <AnalyticsView />}

      {/* Add course modal */}
      <Modal open={showCourse} onClose={() => setShowCourse(false)} title={t('study.addCourse')}>
        <div className="space-y-3">
          <Field label={t('common.name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('study.code')}><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <Field label={t('study.creditHours')}><input type="number" className="input" value={credit} onChange={(e) => setCredit(e.target.value)} /></Field>
            <Field label={t('study.instructor')}><input className="input" value={instructor} onChange={(e) => setInstructor(e.target.value)} /></Field>
            <Field label={t('study.semester')}><input className="input" value={semester} onChange={(e) => setSemester(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCourse(false)}>{t('common.cancel')}</Button>
            <Button onClick={addCourse}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>

      {/* Weekly plan modal */}
      <Modal open={showWeekModal} onClose={() => setShowWeekModal(false)} title="أنشئ خطتك الأسبوعية">
        <div className="space-y-3">
          <Field label="كم دقيقة تقريبًا تستطيع الدراسة أسبوعيًا؟">
            <input type="number" className="input" value={weekMinutes} onChange={(e) => setWeekMinutes(Number(e.target.value))} />
          </Field>
          <p className="text-xs text-ink-faint">تُبنى الخطة من اختباراتك، إتقانك الحالي، أخطائك، والمواضيع المهملة — بدون مبالغة في ساعات اليوم.</p>
          <Button
            className="w-full"
            onClick={async () => {
              await api.post('/study/plan/generate', { availableMinutes: weekMinutes });
              setWeekDone(true);
            }}
          >
            <Sparkles className="h-4 w-4" /> توليد الخطة
          </Button>
          {weekDone && <p className="rounded-lg bg-ok-bg px-3 py-2 text-center text-sm font-bold text-ok">✓ أُنشئت خطة الأسبوع — افتح تبويب الخطة</p>}
        </div>
      </Modal>
    </div>
  );
}

function TodayPlanView({ onStart }: { onStart: () => void }) {
  const [plan, setPlan] = useState<{ items: { title: string; courseName?: string; minutes: number; priority?: string; reason?: string }[]; totalMinutes: number } | null>(null);
  const [week, setWeek] = useState<{ date: string; title?: string; minutes?: number }[]>([]);

  useEffect(() => {
    api.get<{ items: { title: string; courseName?: string; minutes: number; priority?: string; reason?: string }[]; totalMinutes: number }>('/study/plan/today').then(setPlan).catch(() => {});
    api.get<{ week: { date: string; minutes: number }[] }>('/study/plan/week').then((r) => {
      const grouped = new Map<string, number>();
      for (const item of r.week || []) {
        grouped.set(item.date, (grouped.get(item.date) || 0) + item.minutes);
      }
      setWeek(Array.from(grouped.entries()).map(([date, minutes]) => ({ date, minutes })));
    }).catch(() => {});
  }, []);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="!p-4">
        <p className="mb-2 text-sm font-bold text-ink">خطة اليوم</p>
        {(plan?.items || []).length ? (
          <ul className="space-y-1.5">
            {plan!.items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg bg-elevated/60 px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-danger' : item.priority === 'medium' ? 'bg-warn' : 'bg-brand-accent'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                  {item.reason && <p className="truncate text-[11px] text-ink-faint">{item.courseName} — {item.reason}</p>}
                </div>
                <span className="text-sm font-bold text-brand-dark">{item.minutes}د</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState text="لا توجد خطة بعد — أضف مواضيع وامتحانات." />
        )}
        {plan?.totalMinutes ? <p className="mt-2 text-xs text-ink-faint">المجموع: {plan.totalMinutes} دقيقة</p> : null}
      </Card>

      <Card className="!p-4">
        <p className="mb-2 text-sm font-bold text-ink">خطة الأسبوع</p>
        {week.length ? (
          <ul className="space-y-1">
            {week.map((d) => (
              <li key={d.date} className="flex justify-between text-sm">
                <span className="text-ink-soft">{d.date}</span>
                <span className="font-bold text-brand-dark">{d.minutes}د</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState text="لم تُنشئ خطة أسبوعية بعد — استخدم زر «أنشئ خطتي الأسبوعية»." />
        )}
        <Button variant="ghost" className="mt-3 !px-3 !py-1.5 text-xs" onClick={onStart}>ابدأ جلسة الآن</Button>
      </Card>
    </div>
  );
}
