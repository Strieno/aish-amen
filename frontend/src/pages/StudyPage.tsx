import { useState } from 'react';
import { BookMarked, CalendarClock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import type { Course, CourseTopic, Exam } from '../lib/types';
import { Badge, Button, Card, EmptyState, Field, Modal, Select, Spinner } from '../components/ui';
import { useAiAction } from '../lib/useAiAction';
import AiResultBox from '../components/AiResultBox';
import RelatedPanel from '../components/RelatedPanel';

export default function StudyPage() {
  const t = useT();
  const { data: courses, loading, refetch } = useApi<Course[]>('/courses');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail, refetch: refetchDetail } = useApi<Course & { topics: CourseTopic[]; exams: Exam[] }>(
    selectedId ? `/courses/${selectedId}` : '/courses/none',
    [selectedId],
  );
  const [showCourse, setShowCourse] = useState(false);
  const [showExam, setShowExam] = useState(false);
  const [newTopic, setNewTopic] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credit, setCredit] = useState('3');
  const [instructor, setInstructor] = useState('');
  const [semester, setSemester] = useState('');
  const tutor = useAiAction('tutor');
  const [tutorMode, setTutorMode] = useState<'explain' | 'quiz' | 'flashcards' | 'practice'>('explain');
  const [tutorTopic, setTutorTopic] = useState('');

  const addCourse = async () => {
    await api.post('/courses', { name, code: code || null, credit_hours: Number(credit) || 3, instructor: instructor || null, semester: semester || null });
    setName(''); setCode(''); setCredit('3'); setInstructor(''); setSemester('');
    setShowCourse(false);
    refetch();
  };

  const addTopic = async () => {
    if (!newTopic.trim() || !selectedId) return;
    await api.post(`/courses/${selectedId}/topics`, { title: newTopic.trim() });
    setNewTopic('');
    refetchDetail();
  };

  const toggleTopic = async (topic: CourseTopic) => {
    await api.patch(`/topics/${topic.id}`, { done: !topic.done });
    refetchDetail();
  };

  const selected = (courses || []).find((c) => c.id === selectedId) || (courses || [])[0];
  const activeCourse = selected?.id ? detail : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="section-title">{t('study.title')}</h1>
        <Button onClick={() => setShowCourse(true)}>
          <Plus className="h-4 w-4" /> {t('study.addCourse')}
        </Button>
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-8 block h-7 w-7" />
      ) : (courses || []).length === 0 ? (
        <EmptyState text={t('study.noCourses')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          {/* Courses */}
          <div className="space-y-1.5">
            {(courses || []).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-start transition ${
                  selected?.id === c.id ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:bg-elevated'
                }`}
              >
                <BookMarked className={`mt-0.5 h-4 w-4 shrink-0 ${selected?.id === c.id ? 'text-brand-dark' : 'text-ink-faint'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                  <span className="block text-xs text-ink-faint">{c.code || c.semester || ''}</span>
                  <span className="mt-1 flex gap-1">
                    <Badge tone="neutral">{(c.topics_done ?? 0)}/{(c.topics_count ?? 0)}</Badge>
                    {(c.upcoming_exams ?? 0) > 0 && <Badge tone="warn">{(c.upcoming_exams ?? 0)} {t('study.exams')}</Badge>}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* Course detail */}
          {activeCourse ? (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold text-ink">{activeCourse.name}</h2>
                    <p className="text-sm text-ink-faint">
                      {[activeCourse.code, activeCourse.instructor, activeCourse.semester].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await api.del(`/courses/${activeCourse.id}`);
                      setSelectedId(null);
                      refetch();
                    }}
                    className="btn-icon !h-8 !w-8"
                    aria-label={`${t('common.delete')}: ${activeCourse.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <MiniStat value={String(activeCourse.credit_hours)} label={t('study.creditHours')} />
                  <MiniStat value={`${activeCourse.topics_done ?? 0}/${activeCourse.topics_count ?? 0}`} label={t('study.topics')} />
                  <MiniStat value={String(activeCourse.upcoming_exams ?? 0)} label={t('study.upcoming')} />
                </div>
              </Card>

              {/* Related entities */}
              <Card>
                <RelatedPanel entityType="course" entityId={activeCourse.id} />
              </Card>

              {/* AI tutor */}
              <Card>
                <div className="mb-2 flex items-center gap-2 text-brand-dark">
                  <Sparkles className="h-4 w-4" />
                  <h3 className="text-sm font-bold">{t('ai.tutorTitle')}</h3>
                </div>
                <p className="mb-2 text-xs text-ink-faint">{t('ai.tutorHint')}</p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(['explain', 'quiz', 'flashcards', 'practice'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setTutorMode(m)}
                      className={`chip cursor-pointer ${tutorMode === m ? 'bg-brand text-white' : ''}`}
                    >
                      {t(`ai.${m}`)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder={t('ai.topic')}
                    value={tutorTopic}
                    onChange={(e) => setTutorTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && tutor.run({ course_id: selected?.id, mode: tutorMode, question: tutorTopic })}
                  />
                  <Button onClick={() => tutor.run({ course_id: selected?.id, mode: tutorMode, question: tutorTopic })} disabled={tutor.loading}>
                    {tutor.loading ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {t('ai.run')}
                  </Button>
                </div>
                <AiResultBox loading={tutor.loading} result={tutor.result} />
              </Card>

              {/* Topics */}
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">{t('study.topics')}</h3>
                  <div className="flex gap-1">
                    <input className="input !w-40 !py-1.5 text-sm" placeholder={t('study.addTopic')} value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
                    <Button variant="ghost" onClick={addTopic} className="!px-3 !py-1.5" aria-label={t('study.addTopic')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {(activeCourse.topics || []).map((topic) => (
                    <li key={topic.id}>
                      <button onClick={() => toggleTopic(topic)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-elevated">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${topic.done ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                          {topic.done && '✓'}
                        </span>
                        <span className={`text-sm ${topic.done ? 'text-ink-faint line-through' : 'text-ink'}`}>{topic.title}</span>
                      </button>
                    </li>
                  ))}
                  {(activeCourse.topics || []).length === 0 && (
                    <li className="text-sm text-ink-faint">{t('common.none')}</li>
                  )}
                </ul>
              </Card>

              {/* Exams */}
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">{t('study.exams')}</h3>
                  <Button variant="ghost" onClick={() => setShowExam(true)} className="!px-3 !py-1.5 text-xs">
                    <Plus className="h-4 w-4" /> {t('study.addExam')}
                  </Button>
                </div>
                {(activeCourse.exams || []).length === 0 ? (
                  <p className="text-sm text-ink-faint">{t('common.none')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {(activeCourse.exams || []).map((e) => (
                      <li key={e.id} className="flex items-center justify-between py-2">
                        <span className="flex items-center gap-2 text-sm text-ink">
                          <CalendarClock className="h-4 w-4 text-brand-dark" />
                          {e.title}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-faint">
                          {e.exam_date}
                          {e.grade !== null && <Badge tone="brand">{e.grade}</Badge>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : (
            <EmptyState text={t('study.noCourses')} />
          )}
        </div>
      )}

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

      {selected && (
        <Modal open={showExam} onClose={() => setShowExam(false)} title={t('study.addExam')}>
          <ExamForm
            courseId={selected.id}
            onDone={() => { setShowExam(false); refetchDetail(); }}
          />
        </Modal>
      )}
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-elevated p-3">
      <p className="text-lg font-extrabold text-ink">{value}</p>
      <p className="text-xs text-ink-faint">{label}</p>
    </div>
  );
}

function ExamForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('MIDTERM');
  const [date, setDate] = useState('');
  const [weight, setWeight] = useState('');
  const [grade, setGrade] = useState('');

  return (
    <div className="space-y-3">
      <Field label={t('common.title')}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('study.examType')}>
          <Select value={type} onChange={setType}>
            {['QUIZ', 'MIDTERM', 'FINAL', 'LAB', 'OTHER'].map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label={t('common.date')}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('study.weight')}><input type="number" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
        <Field label={t('study.grade')}><input type="number" className="input" value={grade} onChange={(e) => setGrade(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          onClick={async () => {
            await api.post('/exams', { course_id: courseId, title, exam_type: type, exam_date: date || null, weight: weight ? Number(weight) : null, grade: grade ? Number(grade) : null });
            onDone();
          }}
        >
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}
