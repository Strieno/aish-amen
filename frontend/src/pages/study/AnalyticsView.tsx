import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Spinner } from '../../components/ui';
import { normalizeAnalyticsData, type AnalyticsData } from '../../lib/study-types';

function Bars({ data, height = 90 }: { data: { label: string; value: number; color?: string }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex-1">
          <div
            className="w-full rounded-t-md transition-all duration-700"
            style={{ height: `${Math.max(4, (d.value / max) * (height - 22))}px`, background: d.color || 'rgb(var(--brand-accent))' }}
          />
          <div className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-card px-1.5 py-0.5 text-[10px] font-bold opacity-0 shadow-card transition group-hover:opacity-100">
            {d.label}: {d.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LineTrend({ data }: { data: { label: string; value: number | null }[] }) {
  const w = 300;
  const h = 70;
  const pad = 6;
  const pts = data.map((d, i) => ({ x: pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2), y: d.value == null ? null : pad + (1 - d.value / 100) * (h - pad * 2) }));
  const valid = pts.filter((p) => p.y != null) as { x: number; y: number }[];
  const path = valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {valid.length > 1 && <path d={path} fill="none" stroke="rgb(var(--brand-accent))" strokeWidth="2" strokeLinecap="round" />}
      {pts.map((p, i) =>
        p.y == null ? null : <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="rgb(var(--card))" stroke="rgb(var(--brand-accent))" strokeWidth="1.4" />,
      )}
    </svg>
  );
}

export default function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api.get<AnalyticsData>('/study/analytics?days=14')
      .then((value) => { if (alive) setData(normalizeAnalyticsData(value)); })
      .catch((reason) => {
        if (!alive) return;
        setData(null);
        setError(reason instanceof Error ? reason.message : 'تعذر تحميل تحليلات الدراسة.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);

  if (loading) return <Spinner className="mx-auto my-8 block h-6 w-6" />;
  if (error || !data) {
    return (
      <div className="card mx-auto my-8 max-w-lg p-5 text-center">
        <p className="mb-3 text-sm text-danger">{error || 'تعذر تحميل تحليلات الدراسة.'}</p>
        <Button onClick={() => setAttempt((value) => value + 1)}>إعادة المحاولة</Button>
      </div>
    );
  }

  const hasWeekly = data.weekly.some((d) => d.minutes > 0);
  const heatMax = Math.max(1, ...data.heatmap.map((d) => d.total));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BarChart3 className="h-4 w-4 text-brand-dark" />
        <h2 className="section-title">تحليلات الدراسة</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="دقائق الدراسة (آخر 14 يوم)">
          {hasWeekly ? <Bars data={data.weekly.map((d) => ({ label: d.date.slice(5), value: d.minutes }))} /> : <Empty>لا توجد جلسات بعد — ابدأ أول جلسة لتظهر.</Empty>}
        </Card>

        <Card title="توزيع الوقت حسب المادة (آخر 30 يوم)">
          {data.subjectDistribution.length ? (
            <div className="space-y-2">
              {data.subjectDistribution.slice(0, 5).map((s) => (
                <div key={s.courseId || s.courseName} className="flex items-center gap-2 text-sm">
                  <span className="w-28 truncate text-ink-soft">{s.courseName}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-pill bg-line">
                    <div className="h-full rounded-pill bg-brand-accent transition-all duration-700" style={{ width: `${Math.min(100, (s.minutes / Math.max(1, data.subjectDistribution[0].minutes)) * 100)}%` }} />
                  </div>
                  <span className="w-14 text-end text-xs text-ink-faint">{Math.round(s.minutes / 60 * 10) / 10} س</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>لا توجد بيانات موزعة بعد.</Empty>
          )}
        </Card>

        <Card title="دقة الممارسة">
          <LineTrend data={data.accuracyTrend.map((d) => ({ label: d.date.slice(5), value: d.accuracy }))} />
        </Card>

        <Card title="متوسط الإتقان">
          <LineTrend data={data.masteryTrend.map((d) => ({ label: d.date.slice(5), value: d.avg }))} />
        </Card>

        <Card title="أضعف المواضيع">
          {data.weak.length ? (
            <ul className="space-y-1.5">
              {data.weak.map((w) => (
                <li key={w.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink">{w.title} <span className="text-ink-faint">({w.course_name})</span></span>
                  <span className="chip !bg-warn-bg !text-warn">{w.mastery}%</span>
                </li>
              ))}
            </ul>
          ) : <Empty>لا توجد مواضيع ضعيفة بعد.</Empty>}
        </Card>

        <Card title="أقوى المواضيع">
          {data.strong.length ? (
            <ul className="space-y-1.5">
              {data.strong.map((w) => (
                <li key={w.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink">{w.title} <span className="text-ink-faint">({w.course_name})</span></span>
                  <span className="chip !bg-ok-bg !text-ok">{w.mastery}%</span>
                </li>
              ))}
            </ul>
          ) : <Empty>لا توجد مواضيع متقنة بعد.</Empty>}
        </Card>
      </div>

      <Card title={`خريطة حرارية — ساعات الدراسة (آخر ${data.heatmap.length} يوم)`}>
        <div className="grid grid-cols-7 gap-1">
          {data.heatmap.map((d) => (
            <div key={d.date} className="group relative" title={`${d.date}\n${Math.round(d.total / 60 * 10) / 10} ساعة`}>
              <div
                className="aspect-square rounded-md transition"
                style={{ background: d.total === 0 ? 'rgb(var(--elevated))' : `rgba(var(--brand) / ${0.25 + (d.total / heatMax) * 0.75})`, border: d.total > 0 ? '1px solid rgb(var(--brand-accent) / 0.5)' : '1px solid rgb(var(--line))' }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-card px-2 py-1 text-[10px] shadow-card group-hover:block">
                <span className="font-bold text-ink">{d.date.slice(5)}</span>
                <span className="ms-1 text-ink-soft">{Math.round(d.total / 60 * 10) / 10} ساعة</span>
                {d.courses.slice(0, 2).map((c) => <span key={c.course} className="block text-ink-faint">{c.course} {c.minutes}د</span>)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-bold text-ink">{title}</p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-xs text-ink-faint">{children}</p>;
}
