import { useState } from 'react';
import { BookMarked, CalendarClock, Check, Layers, Map as MapIcon, NotebookPen, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Field, Modal, Select } from '../../components/ui';
import { normalizeCourseDetail, type CourseDetail, type Topic } from '../../lib/study-types';
import FlashcardsView from './FlashcardsView';
import PracticeEngine from './PracticeEngine';
import KnowledgeMap from './KnowledgeMap';
import TutorPanel from './TutorPanel';
import { masteryState } from './KnowledgeMap';

const STATE_COLOR: Record<string, string> = {
  mastered: 'rgb(var(--brand-accent))', good: 'rgb(var(--brand))', medium: 'rgb(var(--warn))', weak: 'rgb(var(--danger))', untouched: 'rgb(var(--line))',
};

export default function CourseCockpit({ detail, onRefetch }: { detail: CourseDetail; onRefetch: () => void }) {
  const course = normalizeCourseDetail(detail);
  const [tab, setTab] = useState<'overview' | 'topics' | 'notes' | 'cards' | 'practice' | 'exams' | 'map' | 'tutor'>('overview');
  const [aiVisual, setAiVisual] = useState<Parameters<typeof KnowledgeMap>[0]['aiVisual']>(null);
  const [newTopic, setNewTopic] = useState('');
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [showExam, setShowExam] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    await api.post(`/courses/${detail.id}/topics`, { title: newTopic.trim() });
    setNewTopic('');
    onRefetch();
  };

  const toggleTopic = async (t: Topic) => {
    await api.patch(`/topics/${t.id}`, { done: t.done ? 0 : 1 });
    onRefetch();
  };

  const addNote = async () => {
    if (!newNote.title.trim()) return;
    await api.post('/study/notes', { course_id: detail.id, title: newNote.title.trim(), content: newNote.content });
    setNewNote({ title: '', content: '' });
    setShowNote(false);
    onRefetch();
  };

  const tabs: { key: typeof tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'نظرة عامة', icon: BookMarked },
    { key: 'topics', label: 'المواضيع', icon: Check },
    { key: 'notes', label: 'الملاحظات', icon: NotebookPen },
    { key: 'cards', label: 'البطاقات', icon: Layers },
    { key: 'practice', label: 'الممارسة', icon: BookMarked },
    { key: 'exams', label: 'الامتحانات', icon: CalendarClock },
    { key: 'map', label: 'الخريطة المعرفية', icon: MapIcon },
    { key: 'tutor', label: 'المدرس الذكي', icon: BookMarked },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-ink">{detail.name}</h2>
          <p className="text-sm text-ink-faint">{[detail.code, detail.instructor, detail.semester].filter(Boolean).join(' • ') || 'مادة دراسية'}</p>
        </div>
        <button onClick={async () => { await api.del(`/courses/${detail.id}`); window.location.reload(); }} className="btn-icon !h-8 !w-8" aria-label="حذف المادة">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`chip cursor-pointer ${tab === t.key ? 'bg-brand text-white' : ''}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="!p-4">
            <p className="mb-2 text-sm font-bold text-ink">الإتقان العام</p>
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(var(--line))" strokeWidth="7" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={STATE_COLOR[masteryState(detail.mastery_avg || 0)]} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(detail.mastery_avg || 0) / 100 * 213.6} 213.6`} className="transition-all duration-700" />
                </svg>
                <span className="absolute inset-0 grid place-items-center text-lg font-extrabold text-ink">{detail.mastery_avg}%</span>
              </div>
              <div className="space-y-1 text-xs text-ink-soft">
                <p>مواضيع: {course.topics.length} ({course.topics.filter((t) => t.done).length} مكتملة)</p>
                <p>متقن: {detail.mastered_count ?? 0} • ضعيف: {detail.weak_count ?? 0}</p>
                <p>ساعات الدراسة: {detail.study_hours ?? 0} ساعة</p>
              </div>
            </div>
          </Card>

          <Card className="!p-4">
            <p className="mb-2 text-sm font-bold text-ink">الخطوة التالية المقترحة</p>
            {course.topics.length ? (
              (() => {
                const weak = course.topics.filter((t) => Number(t.mastery || 0) < 45 && Number(t.mastery || 0) > 0);
                const target = weak[0] || course.topics.find((t) => !t.done) || course.topics[0];
                return (
                  <div>
                    <p className="text-sm text-ink">{target.title}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {weak.length ? `الإتقان ${Math.round(Number(target.mastery || 0))}% — يحتاج مراجعة` : 'لم يُكمل بعد — ابدأ به ثم اختبر نفسك'}
                    </p>
                    <button type="button" className="btn-primary mt-2 !px-3 !py-1.5 text-xs" onClick={() => setTab('practice')}>ابدأ الممارسة</button>
                  </div>
                );
              })()
            ) : (
              <EmptyState text="أضف مواضيع أولاً" />
            )}
          </Card>

          {course.mistakes.length > 0 && (
            <Card className="!p-4 md:col-span-2">
              <p className="mb-2 text-sm font-bold text-ink">أخطاء متكررة في هذه المادة</p>
              <ul className="space-y-1">
                {course.mistakes.slice(0, 4).map((m) => (
                  <li key={m.id} className="text-xs text-ink-soft">• {m.question.slice(0, 80)} ×{m.times}</li>
                ))}
              </ul>
            </Card>
          )}

          {course.sessions.length > 0 && (
            <Card className="!p-4 md:col-span-2">
              <p className="mb-2 text-sm font-bold text-ink">آخر الجلسات</p>
              <ul className="space-y-1">
                {course.sessions.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex justify-between text-xs text-ink-soft">
                    <span>{s.started_at.slice(0, 16)} — {s.topic_title || 'عام'} ({s.minutes}د)</span>
                    {s.understanding != null && <Badge tone="brand">فهم {s.understanding}/5</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'topics' && (
        <Card className="!p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink">المواضيع</p>
            <div className="flex gap-1">
              <input className="input !w-44 !py-1.5 text-sm" placeholder="موضوع جديد" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTopic()} />
              <Button variant="ghost" className="!px-3 !py-1.5" onClick={addTopic}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {course.topics.map((t) => {
              const state = masteryState(Number(t.mastery || 0));
              return (
                <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-elevated">
                  <button onClick={() => toggleTopic(t)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${t.done ? 'border-brand bg-brand text-white' : 'border-line'}`} aria-label={t.title}>
                    {t.done && <Check className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${t.done ? 'text-ink-faint line-through' : 'text-ink'}`}>{t.title}</span>
                      <span className="text-xs font-bold" style={{ color: STATE_COLOR[state] }}>{Math.round(Number(t.mastery || 0))}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-line">
                      <div className="h-full rounded-pill transition-all duration-500" style={{ width: `${t.mastery || 0}%`, background: STATE_COLOR[state] }} />
                    </div>
                  </div>
                  <Select value={t.difficulty || 'medium'} onChange={(v) => { api.patch(`/topics/${t.id}`, { difficulty: v }); onRefetch(); }} className="!w-28 !py-1 text-xs">
                    {['foundation', 'easy', 'medium', 'hard', 'exam'].map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                  <button onClick={async () => { await api.del(`/topics/${t.id}`); onRefetch(); }} className="btn-icon !h-7 !w-7" aria-label="حذف"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              );
            })}
            {!course.topics.length && <li className="text-sm text-ink-faint">لا توجد مواضيع بعد.</li>}
          </ul>
        </Card>
      )}

      {tab === 'notes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setShowNote(true)}><Plus className="h-3.5 w-3.5" /> ملاحظة جديدة</Button>
          </div>
          {course.notes.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {course.notes.map((n) => (
                <Card key={n.id} className="!p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-bold text-ink">{n.title}</p>
                    <div className="flex gap-1">
                      <button onClick={async () => { await api.del(`/study/notes/${n.id}`); onRefetch(); }} className="btn-icon !h-6 !w-6" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">{n.content?.slice(0, 300)}</p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState text="لا توجد ملاحظات بعد." />
          )}
        </div>
      )}

      {tab === 'cards' && <Card className="!p-4"><FlashcardsView courseId={detail.id} /></Card>}
      {tab === 'practice' && <Card className="!p-4"><PracticeEngine courseId={detail.id} /></Card>}

      {tab === 'exams' && (
        <Card className="!p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink">الامتحانات</p>
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setShowExam(true)}><Plus className="h-3.5 w-3.5" /> إضافة اختبار</Button>
          </div>
          {course.exams.length ? (
            <ul className="divide-y divide-line">
              {course.exams.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{e.title}</p>
                    <p className="text-xs text-ink-faint">{e.exam_date || 'بدون تاريخ'} {e.exam_type ? ` • ${e.exam_type}` : ''}</p>
                  </div>
                  {e.readiness && e.readiness.daysLeft != null && (
                    <span className="chip !bg-brand-soft">جاهزية {e.readiness.ready}% — بعد {e.readiness.daysLeft} يوم</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="لا توجد اختبارات مضافة بعد." />
          )}
        </Card>
      )}

      {tab === 'map' && (
        <Card className="!p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink">الخريطة المعرفية</p>
            {aiVisual && <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => setAiVisual(null)}>عرض الخريطة الافتراضية</Button>}
          </div>
          <KnowledgeMap topics={course.topics} aiVisual={aiVisual} onSelectTopic={() => setTab('practice')} />
        </Card>
      )}

      {tab === 'tutor' && (
        <Card className="!p-4">
          <TutorPanel courseId={detail.id} onVisual={(v) => { setAiVisual(v); setTab('map'); }} />
        </Card>
      )}

      {showExam && (
        <Modal open={showExam} onClose={() => setShowExam(false)} title="إضافة اختبار">
          <ExamForm
            courseId={detail.id}
            onDone={() => { setShowExam(false); onRefetch(); }}
          />
        </Modal>
      )}

      {showNote && (
        <Modal open={showNote} onClose={() => setShowNote(false)} title="ملاحظة جديدة">
          <div className="space-y-3">
            <Field label="العنوان"><input className="input" value={newNote.title} onChange={(e) => setNewNote({ ...newNote, title: e.target.value })} /></Field>
            <Field label="المحتوى (Markdown)"><textarea className="input min-h-32 resize-y" value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNote(false)}>إلغاء</Button>
              <Button onClick={addNote}>حفظ</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ExamForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('MIDTERM');
  const [date, setDate] = useState('');
  const [weight, setWeight] = useState('');
  const [grade, setGrade] = useState('');
  return (
    <div className="space-y-3">
      <Field label="العنوان"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع">
          <Select value={type} onChange={setType}>{['QUIZ', 'MIDTERM', 'FINAL', 'LAB', 'OTHER'].map((x) => <option key={x} value={x}>{x}</option>)}</Select>
        </Field>
        <Field label="التاريخ"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="الوزن"><input type="number" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
        <Field label="الدرجة"><input type="number" className="input" value={grade} onChange={(e) => setGrade(e.target.value)} /></Field>
      </div>
      <Button onClick={async () => {
        await api.post('/exams', { course_id: courseId, title, exam_type: type, exam_date: date || null, weight: weight ? Number(weight) : null, grade: grade ? Number(grade) : null });
        onDone();
      }}>إضافة</Button>
    </div>
  );
}
