import { useEffect, useState } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Spinner } from '../../components/ui';
import type { Flashcard } from '../../lib/study-types';
import { localDateKey } from '../../lib/date';

export default function FlashcardsView({ courseId, topicId }: { courseId?: string | null; topicId?: string | null }) {
  const [due, setDue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const cards = await api.get<Flashcard[]>('/study/flashcards' + (courseId ? `?course_id=${courseId}` : ''));
      const today = localDateKey();
      setDue(cards.filter((c) => !c.due_date || c.due_date <= today));
      setIndex(0);
      setFlipped(false);
    } catch {
      setError('تعذر تحميل البطاقات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const add = async () => {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    try {
      await api.post('/study/flashcards', { course_id: courseId, topic_id: topicId, items: [{ front: front.trim(), back: back.trim() }] });
      setFront('');
      setBack('');
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const review = async (grade: 'again' | 'hard' | 'good' | 'easy') => {
    const card = due[index];
    if (!card) return;
    await api.post(`/study/flashcards/${card.id}/review`, { grade });
    setFlipped(false);
    setIndex((i) => (i + 1 < due.length ? i + 1 : 0));
    load();
  };

  const remove = async (id: string) => {
    await api.del(`/study/flashcards/${id}`);
    load();
  };

  if (loading) return <Spinner className="mx-auto my-6 block h-6 w-6" />;

  const card = due[index];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-brand-dark">
          <Layers className="h-4 w-4" />
          <h3 className="text-sm font-bold">بطاقات المراجعة</h3>
          <span className="chip">{due.length} مستحقة</span>
        </div>
        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> بطاقة جديدة
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {showForm && (
        <div className="rounded-xl border border-line bg-elevated/60 p-3">
          <input className="input mb-2" placeholder="السؤال (الوجه الأمامي)" value={front} onChange={(e) => setFront(e.target.value)} />
          <textarea className="input mb-2 min-h-20 resize-y" placeholder="الإجابة (الوجه الخلفي)" value={back} onChange={(e) => setBack(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={add} disabled={saving || !front.trim() || !back.trim()}>{saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} حفظ</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {!card ? (
        <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-faint">
          {due.length === 0 ? 'لا توجد بطاقات مستحقة الآن. أضف بطاقات وستظهر هنا حسب جدول المراجعة المتباعدة.' : 'انتهت هذه الدفعة.'}
        </div>
      ) : (
        <div className="relative min-h-44 cursor-pointer select-none" onClick={() => setFlipped((f) => !f)}>
          <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl border p-6 text-center transition-transform duration-300 ${flipped ? 'rotate-y-180 border-brand-lighter bg-brand-soft/60' : 'border-line bg-card'}`}>
            {!flipped ? (
              <>
                <p className="text-[11px] font-bold text-ink-faint">اضغط للكشف</p>
                <p className="text-lg font-bold text-ink">{card.front}</p>
              </>
            ) : (
              <p className="text-base leading-relaxed text-ink">{card.back}</p>
            )}
          </div>
        </div>
      )}

      {card && flipped && (
        <div className="grid grid-cols-4 gap-2">
          <Button variant="danger" className="!px-2 !py-2 text-xs" onClick={() => review('again')}>مرة أخرى</Button>
          <Button variant="ghost" className="!px-2 !py-2 text-xs" onClick={() => review('hard')}>صعب</Button>
          <Button variant="ghost" className="!px-2 !py-2 text-xs" onClick={() => review('good')}>جيد</Button>
          <Button variant="primary" className="!px-2 !py-2 text-xs" onClick={() => review('easy')}>سهل</Button>
        </div>
      )}

      {card && (
        <button type="button" onClick={() => remove(card.id)} className="btn-icon !h-7 !w-7" aria-label="حذف البطاقة">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
