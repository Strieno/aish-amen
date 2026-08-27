import { useState } from 'react';
import { GraduationCap, Send, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Spinner } from '../../components/ui';
import Markdown from '../../components/Markdown';

export type TutorMode =
  | 'explain' | 'simple' | 'socratic' | 'quiz' | 'example' | 'challenge'
  | 'correct' | 'feynman' | 'recap' | 'exam' | 'visual';

export interface AIVisual {
  type: string;
  title?: string;
  nodes?: { id: string; label: string }[];
  edges?: [string, string][];
  steps?: { title: string; detail: string }[];
  headers?: string[];
  rows?: Array<{ label: string; values?: (string | number)[] } | (string | number)[]>;
  events?: { title: string; date: string }[];
  columns?: string[];
  center?: string;
  branches?: { label: string; children?: string[] }[];
  root?: string;
  children?: string[];
  lines?: { line: string; explanation: string }[];
}

const MODES: { key: TutorMode; label: string; title: string }[] = [
  { key: 'explain', label: 'اشرح لي', title: 'شرح واضح ومباشر' },
  { key: 'simple', label: 'اشرح ببساطة', title: 'شرح كأني عمري 12' },
  { key: 'socratic', label: 'سقراطي', title: 'أسئلة متدرجة تصل بكم للحل' },
  { key: 'quiz', label: 'امتحني', title: 'توليد أسئلة قصيرة' },
  { key: 'example', label: 'مثال محلول', title: 'مثال خطوة بخطوة' },
  { key: 'challenge', label: 'تحديني', title: 'أسئلة أصعب' },
  { key: 'correct', label: 'صحح فهمي', title: 'قيّم فهمي وصحّحه' },
  { key: 'feynman', label: 'فينمان', title: 'اشرح المفهوم بأسلوبك' },
  { key: 'recap', label: 'مراجعة سريعة', title: 'أهم 5 نقاط في 5 دقائق' },
  { key: 'exam', label: 'وضع امتحان', title: 'محاكاة سؤال امتحان' },
  { key: 'visual', label: 'حوّل لرسم', title: 'تمثيل بصري للمفهوم' },
];

export default function TutorPanel({
  courseId,
  topicId,
  onVisual,
}: {
  courseId?: string | null;
  topicId?: string | null;
  onVisual?: (v: AIVisual) => void;
}) {
  const [mode, setMode] = useState<TutorMode>('explain');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; mode: TutorMode } | null>(null);
  const [error, setError] = useState('');

  const run = async (m = mode) => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await api.post<{ text?: string; fallback?: boolean; error?: string }>('/study/tutor', { mode: m, course_id: courseId, topic_id: topicId, question: q });
      if (r.text) setResult({ text: r.text, mode: m });
      else setError(r.error || 'تعذر الحصول على رد');
      if (m === 'visual' && onVisual) {
        try {
          const v = await api.post<AIVisual>('/study/visualize', { course_id: courseId, topic_id: topicId, concept: q });
          if (v.type) onVisual(v);
        } catch { /* visual is optional */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الاتصال بالمدرس');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center gap-2 text-brand-dark">
        <GraduationCap className="h-4 w-4" />
        <h3 className="text-sm font-bold">المدرس الذكي</h3>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            title={m.title}
            onClick={() => { setMode(m.key); if (result) setResult(null); }}
            className={`chip cursor-pointer ${mode === m.key ? 'bg-brand text-white' : ''}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="ما المفهوم الذي تريد مساعدة به؟"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button onClick={() => run()} disabled={!question.trim() || loading}>
          {loading ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {error && <p className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {result && (
        <div className="rounded-xl border border-line bg-elevated/60 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-faint">
              <Sparkles className="h-3 w-3 text-brand-dark" /> {MODES.find((m) => m.key === result.mode)?.label}
            </span>
            <button onClick={() => setResult(null)} className="btn-icon !h-6 !w-6" aria-label="إغلاق">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="prose-sm text-sm text-ink">
            <Markdown content={result.text} />
          </div>
        </div>
      )}
    </div>
  );
}
