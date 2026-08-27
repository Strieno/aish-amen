import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Spinner } from '../../components/ui';
import type { Mistake } from '../../lib/study-types';

const CATEGORY_LABEL: Record<string, string> = {
  concept: 'فهم خاطئ', calculation: 'حساب', logic: 'منطق', memory: 'ذاكرة',
  misreading: 'قراءة خاطئة', code_syntax: 'صياغة كود', code_logic: 'منطق كود', other: 'أخرى',
};

export default function MistakesView() {
  const [rows, setRows] = useState<Mistake[]>([]);
  const [byCategory, setByCategory] = useState<{ category: string; n: number; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ rows: Mistake[]; byCategory: { category: string; n: number; total: number }[] }>('/study/mistakes');
      setRows(r.rows);
      setByCategory(r.byCategory);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner className="mx-auto my-6 block h-6 w-6" />;

  if (!rows.length) {
    return (
      <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-faint">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-brand-dark" />
        دفتر الأخطاء فارغ — كل خطأ في الممارسة يُسجّل هنا تلقائيًا.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {byCategory.map((c) => (
          <span key={c.category} className="chip">{CATEGORY_LABEL[c.category] || c.category}: {c.total}</span>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge>{CATEGORY_LABEL[m.category || 'concept'] || m.category}</Badge>
                  <span className="chip !bg-warn-bg !text-warn">×{m.times}</span>
                  {m.last_seen && <span className="text-[10px] text-ink-faint">آخر ظهور {m.last_seen.slice(0, 10)}</span>}
                </div>
                <p className="text-sm font-semibold text-ink">{m.question}</p>
                {m.user_answer && <p className="mt-1 text-xs text-danger">إجابتك: {m.user_answer}</p>}
                {m.correct_answer && <p className="text-xs text-ok">الصحيح: {m.correct_answer}</p>}
              </div>
              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={async () => { await api.post(`/study/mistakes/${m.id}/resolved`); load(); }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> أتقنته
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-pill bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-dark">{children}</span>;
}
