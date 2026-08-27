import { useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldQuestion, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Spinner } from '../../components/ui';

export interface PracticeQuestion {
  type: 'mc' | 'tf' | 'short';
  question: string;
  options?: string[];
  correct?: string;
  explanation?: string;
  difficulty?: string;
}

const DIFF_ORDER = ['foundation', 'easy', 'medium', 'hard', 'exam'];

export default function PracticeEngine({
  courseId,
  topicId,
  topicTitle,
}: {
  courseId?: string | null;
  topicId?: string | null;
  topicTitle?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [stage, setStage] = useState<'ask' | 'confidence' | 'result'>('ask');
  const [result, setResult] = useState<{ correct: boolean; explanation?: string; misconception?: boolean; mastery?: number | null } | null>(null);
  const [stats, setStats] = useState<{ asked: number; correct: number }>({ asked: 0, correct: 0 });
  const [error, setError] = useState('');

  const next = async (difficulty = 'medium') => {
    setLoading(true);
    setError('');
    try {
      const q = await api.post<PracticeQuestion>('/study/practice/question', { course_id: courseId, topic_id: topicId, topic: topicTitle || 'مفهوم عام', difficulty });
      setQuestion(q);
      setAnswer('');
      setConfidence(null);
      setStage('ask');
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر توليد سؤال. تأكد من إعداد نموذج الذكاء الاصطناعي.');
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!question || confidence == null) return;
    const userAnswer = answer.trim();
    let correct = false;
    if (question.type === 'tf') correct = userAnswer.toLowerCase() === String(question.correct || '').toLowerCase();
    else if (question.type === 'mc') correct = userAnswer === question.correct;
    else correct = (question.correct || '').toLowerCase().includes(userAnswer.toLowerCase()) && userAnswer.length > 2;

    const r = await api.post<{ ok: boolean; misconception?: boolean; mastery?: number | null }>('/study/quiz/answer', {
      course_id: courseId,
      topic_id: topicId,
      question: question.question,
      answer: userAnswer || (question.options || []).find((o) => o === answer) || answer,
      correct,
      confidence,
      difficulty: question.difficulty || 'medium',
      correct_answer: question.correct,
    });
    setResult({ correct, explanation: question.explanation, misconception: r.misconception, mastery: r.mastery });
    setStats((s) => ({ asked: s.asked + 1, correct: s.correct + (correct ? 1 : 0) }));
    setStage('result');
  };

  const confirmAnswer = (val: string) => {
    setAnswer(val);
    setStage('confidence');
  };

  const nextDiff = () => {
    if (!question?.difficulty) return 'medium';
    const idx = DIFF_ORDER.indexOf(question.difficulty);
    const nextIdx = result?.correct ? Math.min(DIFF_ORDER.length - 1, idx + 1) : Math.max(0, idx - 1);
    return DIFF_ORDER[nextIdx];
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-brand-dark">
          <ShieldQuestion className="h-4 w-4" />
          <h3 className="text-sm font-bold">ممارسة تكيّفية</h3>
        </div>
        {stats.asked > 0 && (
          <span className="text-xs text-ink-faint">دقة هذه الجلسة: {Math.round((stats.correct / stats.asked) * 100)}% ({stats.correct}/{stats.asked})</span>
        )}
      </div>

      {error && <p className="rounded-xl border border-warn-border bg-warn-bg px-3 py-2 text-xs text-warn">{error}</p>}

      {!question && (
        <Button onClick={() => next('medium')} disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} اختبرني في {topicTitle || 'هذا الموضوع'}
        </Button>
      )}

      {question && stage !== 'result' && (
        <div className="rounded-xl border border-line bg-elevated/50 p-3">
          <span className="chip mb-2">{question.difficulty}</span>
          <p className="mb-3 text-[15px] font-semibold leading-relaxed text-ink">{question.question}</p>

          {stage === 'ask' && question.type === 'mc' && (
            <div className="space-y-1.5">
              {(question.options || []).map((opt) => (
                <button key={opt} type="button" onClick={() => confirmAnswer(opt)} className="block w-full rounded-lg border border-line bg-card px-3 py-2 text-start text-sm text-ink transition hover:border-brand hover:bg-brand-soft">
                  {opt}
                </button>
              ))}
            </div>
          )}
          {stage === 'ask' && question.type === 'tf' && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => confirmAnswer('true')}>صح</Button>
              <Button variant="ghost" onClick={() => confirmAnswer('false')}>خطأ</Button>
            </div>
          )}
          {stage === 'ask' && question.type === 'short' && (
            <div className="flex gap-2">
              <input className="input flex-1" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="اكتب إجابتك" onKeyDown={(e) => e.key === 'Enter' && answer.trim() && confirmAnswer(answer)} />
              <Button onClick={() => answer.trim() && confirmAnswer(answer)} disabled={!answer.trim()}>إرسال</Button>
            </div>
          )}

          {stage === 'confidence' && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-bold text-ink-faint">ما مدى ثقتك بإجابتك؟</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((c) => (
                  <button key={c} type="button" onClick={() => setConfidence(c)} className={`h-9 flex-1 rounded-lg border text-sm font-bold transition ${confidence === c ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <Button className="mt-2" onClick={submit} disabled={confidence == null}>
                <CheckCircle2 className="h-4 w-4" /> صحّح
              </Button>
            </div>
          )}
        </div>
      )}

      {question && stage === 'result' && result && (
        <div className={`rounded-xl border p-3 ${result.correct ? 'border-ok-border bg-ok-bg' : 'border-danger-border bg-danger-bg'}`}>
          <p className="mb-1 flex items-center gap-2 font-bold">
            {result.correct ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-danger" />}
            <span className={result.correct ? 'text-ok' : 'text-danger'}>{result.correct ? 'إجابة صحيحة' : 'إجابة خاطئة'}</span>
            {result.misconception && <span className="chip !bg-warn-bg !text-warn">مفهوم خاطئ تم تسجيله</span>}
          </p>
          {question.correct && !result.correct && <p className="mb-1 text-xs text-ink-soft">الإجابة الصحيحة: {question.correct}</p>}
          {result.explanation && <p className="text-sm leading-relaxed text-ink">{result.explanation}</p>}
          {result.mastery != null && <p className="mt-1 text-xs font-bold text-brand-dark">إتقان الموضوع: {result.mastery}%</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => next(nextDiff())}>
              <RefreshCw className="h-4 w-4" /> {result.correct ? 'سؤال أصعب' : 'سؤال أبسط'}
            </Button>
            <Button variant="ghost" onClick={() => next('medium')}>سؤال متوسط</Button>
          </div>
        </div>
      )}
    </div>
  );
}
