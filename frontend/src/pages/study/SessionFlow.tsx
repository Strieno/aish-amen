import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, Timer, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Field, Select, Spinner } from '../../components/ui';
import { celebrate } from '../../components/visualizations';
import type { CourseSummary, Topic } from '../../lib/study-types';

const PRESETS = [10, 15, 25, 45, 60, 90];

function buildPhases(minutes: number): { label: string; minutes: number }[] {
  const ratio = minutes / 45;
  const base: [string, number][] = [
    ['استدعاء سريع', 5],
    ['شرح مفهوم جديد', 12],
    ['أمثلة محلولة', 10],
    ['أسئلة استرجاع نشط', 12],
    ['تصحيح الأخطاء', 4],
    ['تلخيص', 2],
  ];
  const scaled = base.map(([label, m]) => [label, Math.max(1, Math.round(m * ratio))] as [string, number]);
  const total = scaled.reduce((s, [, m]) => s + m, 0);
  const diff = minutes - total;
  // Distribute the remainder onto the main phases.
  let remaining = diff;
  return scaled.map(([label, m], i) => {
    const extra = i < 4 && remaining > 0 ? Math.min(Math.max(0, remaining), 4) : 0;
    remaining -= extra;
    return { label, minutes: m + extra };
  });
}

export default function SessionFlow({
  courses,
  topicsByCourse,
  onOpenTutor,
}: {
  courses: CourseSummary[];
  topicsByCourse: (courseId: string) => Topic[];
  onOpenTutor: (courseId?: string, topicId?: string) => void;
}) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [minutes, setMinutes] = useState(25);
  const [courseId, setCourseId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [phases, setPhases] = useState<{ label: string; minutes: number }[]>([]);

  // focus state
  const [focus, setFocus] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [reflection, setReflection] = useState(false);
  const [saving, setSaving] = useState(false);

  const openBuilder = () => {
    setMinutes(25);
    setCourseId('');
    setTopicId('');
    setPhases(buildPhases(25));
    setBuilderOpen(true);
  };

  const selectMinutes = (m: number) => {
    setMinutes(m);
    setPhases(buildPhases(m));
  };

  const start = () => {
    const plan = phases.length ? phases : buildPhases(minutes);
    setPhases(plan);
    setRemaining(minutes * 60);
    setPhaseIdx(0);
    setPaused(false);
    setBuilderOpen(false);
    setFocus(true);
  };

  useEffect(() => {
    if (!focus || paused) return;
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          setFocus(false);
          setReflection(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [focus, paused]);

  useEffect(() => {
    if (!focus) return;
    // advance phase indicator by consumed time
    const elapsedTotal = minutes * 60 - remaining;
    let acc = 0;
    let idx = 0;
    for (let i = 0; i < phases.length; i += 1) {
      acc += phases[i].minutes * 60;
      if (elapsedTotal < acc) {
        idx = i;
        break;
      }
      idx = i;
    }
    setPhaseIdx(idx);
  }, [remaining, focus, minutes, phases]);

  const finishFocus = async (difficulty: string, understanding: number) => {
    setSaving(true);
    const elapsed = minutes * 60 - remaining;
    const actual = Math.max(1, Math.round(elapsed / 60));
    try {
      await api.post('/study/sessions', {
        course_id: courseId || null,
        topic_id: topicId || null,
        minutes: actual,
        type: 'session',
        difficulty_felt: difficulty,
        understanding,
      });
      celebrate({ text: 'جلسة مكتملة' });
    } catch { /* local-only still works */ }
    setSaving(false);
    setReflection(false);
    setFocus(false);
    setRemaining(0);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const progress = ((minutes * 60 - remaining) / (minutes * 60)) * 100;
  const topics = courseId ? topicsByCourse(courseId) : [];

  return (
    <>
      <Button className="gradient-border" onClick={openBuilder}>
        <Timer className="h-4 w-4" /> ابدأ جلسة دراسة
      </Button>

      {/* Session builder */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBuilderOpen(false)} />
          <div className="card relative z-10 w-full max-w-lg animate-fadeIn bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">بناء جلسة ذكية</h2>
              <button onClick={() => setBuilderOpen(false)} className="btn-icon" aria-label="إغلاق"><X className="h-4 w-4" /></button>
            </div>

            <p className="mb-2 text-sm font-bold text-ink-soft">كم دقيقة لديك الآن؟</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => selectMinutes(p)} className={`chip cursor-pointer ${minutes === p ? 'bg-brand text-white' : ''}`}>{p}د</button>
              ))}
              <input type="number" min="5" max="180" className="input !w-24 !py-1 text-sm" value={minutes} onChange={(e) => selectMinutes(Math.min(180, Math.max(5, Number(e.target.value) || 25)))} />
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Field label="المادة (اختياري)">
                <Select value={courseId} onChange={(v) => { setCourseId(v); setTopicId(''); }}>
                  <option value="">بدون مادة</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="الموضوع (اختياري)">
                <Select value={topicId} onChange={setTopicId} disabled={!topics.length}>
                  <option value="">عام</option>
                  {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
              </Field>
            </div>

            <div className="mb-4 rounded-xl bg-brand-soft/60 p-3">
              <p className="mb-1 text-xs font-bold text-brand-dark">خطة الجلسة ({minutes} دقيقة)</p>
              <ol className="space-y-0.5">
                {phases.map((p, i) => (
                  <li key={i} className="flex justify-between text-sm text-ink-soft">
                    <span>{i + 1}. {p.label}</span>
                    <span className="text-ink-faint">{p.minutes}د</span>
                  </li>
                ))}
              </ol>
            </div>

            <Button className="w-full" onClick={start}><Play className="h-4 w-4" /> ابدأ</Button>
          </div>
        </div>
      )}

      {/* Focus view */}
      {focus && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-canvas/95 p-4 backdrop-blur" role="dialog" aria-label="وضع التركيز">
          <button className="absolute end-4 top-4 btn-icon" onClick={() => { setFocus(false); setReflection(true); }} aria-label="إنهاء مبكر"><Square className="h-5 w-5" /></button>

          <div className="mb-2 text-center">
            <p className="text-lg font-bold text-ink">{phases[phaseIdx]?.label || 'دراسة'}</p>
            <p className="text-xs text-ink-faint">{courses.find((c) => c.id === courseId)?.name || 'بدون مادة'}{topicId ? ` • ${topics.find((t) => t.id === topicId)?.title || ''}` : ''}</p>
          </div>

          <div className="relative my-6 h-56 w-56">
            <div className="absolute inset-0 rounded-full border-8 border-line" />
            <div className="absolute inset-0 rounded-full border-8 border-brand-accent transition-all duration-1000 ring-glow" style={{ borderTopColor: 'transparent', transform: `rotate(${progress * 3.6}deg)` }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold tabular-nums text-ink" dir="ltr">{mm}:{ss}</span>
              <span className="text-xs text-ink-faint">{phases[phaseIdx]?.minutes} دقيقة لهذه المرحلة</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? 'استئناف' : 'إيقاف مؤقت'}
            </Button>
            <Button variant="ghost" onClick={() => onOpenTutor(courseId || undefined, topicId || undefined)}>اسأل المدرس</Button>
            <Button variant="danger" onClick={() => setReflection(true)}>إنهاء</Button>
          </div>
        </div>
      )}

      {/* Reflection */}
      {reflection && (
        <div className="fixed inset-0 z-[56] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="card relative z-10 w-full max-w-sm animate-fadeIn bg-card p-6 text-center">
            <p className="mb-4 text-lg font-bold text-ink">كيف كانت الجلسة؟</p>
            {saving ? (
              <Spinner className="mx-auto block h-6 w-6" />
            ) : (
              <ReflectionForm onDone={finishFocus} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ReflectionForm({ onDone }: { onDone: (difficulty: string, understanding: number) => void }) {
  const [difficulty, setDifficulty] = useState('medium');
  const [understanding, setUnderstanding] = useState(3);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-bold text-ink-soft">الصعوبة</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[['easy', 'سهلة'], ['medium', 'مناسبة'], ['hard', 'صعبة']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setDifficulty(v)} className={`rounded-lg border py-2 text-sm font-semibold ${difficulty === v ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-bold text-ink-soft">كم تشعر أنك فهمت؟</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setUnderstanding(n)} className={`h-10 flex-1 rounded-lg border text-sm font-bold ${understanding === n ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft'}`}>{n}</button>
          ))}
        </div>
      </div>
      <Button className="w-full" onClick={() => onDone(difficulty, understanding)}>حفظ الجلسة</Button>
    </div>
  );
}
