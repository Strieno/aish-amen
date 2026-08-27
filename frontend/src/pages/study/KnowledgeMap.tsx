import { Fragment, useState } from 'react';
import { BookMarked, Play } from 'lucide-react';
import type { Topic } from '../../lib/study-types';

const STATE_META: Record<string, { label: string; color: string }> = {
  untouched: { label: 'غير مدروس', color: 'rgb(var(--line))' },
  weak: { label: 'ضعيف', color: 'rgb(var(--danger))' },
  medium: { label: 'متوسط', color: 'rgb(var(--warn))' },
  good: { label: 'جيد', color: 'rgb(var(--brand))' },
  mastered: { label: 'متقن', color: 'rgb(var(--brand-accent))' },
};

export function masteryState(mastery: number): string {
  if (mastery >= 85) return 'mastered';
  if (mastery >= 65) return 'good';
  if (mastery >= 45) return 'medium';
  if (mastery > 0) return 'weak';
  return 'untouched';
}

/** Renders an AI-generated visualization (concept map / flow / table / ...). */
export function AIVisualization({ visual }: { visual: { type: string; title?: string; nodes?: { id: string; label: string }[]; edges?: [string, string][]; steps?: { title: string; detail: string }[]; headers?: string[]; rows?: Array<{ label: string; values?: (string | number)[] } | (string | number)[]>; events?: { title: string; date: string }[]; columns?: string[]; center?: string; branches?: { label: string; children?: string[] }[]; root?: string; children?: string[]; lines?: { line: string; explanation: string }[] } }) {
  const v = visual || {} as typeof visual;
  const type = v.type || 'concept-map';
  const title = v.title || 'الرسم التعليمي';

  if (type === 'flow' && v.steps) {
    return (
      <ol className="space-y-2">
        {v.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">{i + 1}</span>
            <div>
              <p className="text-sm font-bold text-ink">{s.title}</p>
              {s.detail && <p className="text-xs text-ink-soft">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (type === 'truth-table' && v.headers) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>{v.headers.map((h, i) => <th key={i} className="border-b border-line px-2 py-1 text-start font-bold text-brand-dark">{h}</th>)}</tr>
          </thead>
          <tbody>
            {(v.rows || []).map((row, i) => (
              <tr key={i}>{(Array.isArray(row) ? row : row.values || []).map((cell, j) => <td key={j} className="border-b border-line/60 px-2 py-1">{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'timeline' && v.events) {
    return (
      <div className="relative space-y-3 ps-4 before:absolute before:start-1 before:top-1 before:bottom-1 before:w-0.5 before:bg-brand-lighter">
        {v.events.map((e, i) => (
          <div key={i} className="relative">
            <span className="absolute -start-5 top-1 h-2.5 w-2.5 rounded-full bg-brand-accent" />
            <p className="text-sm font-bold text-ink">{e.title}</p>
            {e.date && <p className="text-xs text-ink-faint">{e.date}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'comparison' && v.columns) {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: `1.2fr repeat(${v.columns.length}, 1fr)` }}>
        <div />
        {v.columns.map((c, i) => <p key={i} className="rounded-lg bg-brand-soft px-2 py-1.5 text-center text-xs font-bold text-brand-dark">{c}</p>)}
        {(v.rows || []).map((row, i) => {
          const label = Array.isArray(row) ? String(row[0] ?? '') : row.label || '';
          const values = Array.isArray(row) ? row.slice(1) : row.values || [];
          return (
            <Fragment key={i}>
              <p className="text-sm font-semibold text-ink">{label}</p>
              {values.map((val, j) => <p key={`v${j}`} className="px-2 py-1 text-sm text-ink-soft">{val}</p>)}
            </Fragment>
          );
        })}
      </div>
    );
  }

  if (type === 'trace' && v.lines) {
    return (
      <ol className="space-y-1.5">
        {(v.lines || []).map((l, i) => (
          <li key={i} className="rounded-lg bg-elevated px-3 py-1.5 text-sm">
            <code dir="ltr" className="text-ink">{l.line}</code>
            {l.explanation && <span className="ms-2 text-xs text-ink-faint">← {l.explanation}</span>}
          </li>
        ))}
      </ol>
    );
  }

  // concept-map / mind-map / hierarchy → tree layout
  const nodes = v.nodes || [];
  const edges = v.edges || [];
  return (
    <svg viewBox="0 0 560 260" className="w-full" role="img" aria-label={title}>
      {edges.map((e, i) => {
        const a = nodes.find((n) => n.id === e[0]);
        const b = nodes.find((n) => n.id === e[1]);
        if (!a || !b) return null;
        const ax = nodes.indexOf(a) * 40 + 40, ay = nodes.indexOf(a) * 60 + 40;
        const bx = nodes.indexOf(b) * 40 + 40, by = nodes.indexOf(b) * 60 + 40;
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke="rgb(var(--brand-accent))" strokeWidth="1.2" className="constellation-link" />;
      })}
      {nodes.map((n, i) => {
        const x = i * 40 + 40;
        const y = i * 60 + 40;
        return (
          <g key={n.id}>
            <circle cx={x} cy={y} r="16" fill="rgb(var(--brand-soft))" stroke="rgb(var(--brand-accent))" strokeWidth="1.5" className="constellation-node" />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="7.5" fill="rgb(var(--ink))">{n.label.slice(0, 16)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function KnowledgeMap({ topics, onSelectTopic, aiVisual }: { topics: Topic[]; onSelectTopic?: (t: Topic) => void; aiVisual?: Parameters<typeof AIVisualization>[0]['visual'] | null }) {
  const [selected, setSelected] = useState<Topic | null>(null);

  if (aiVisual && (aiVisual.nodes || aiVisual.steps || aiVisual.headers)) {
    return <AIVisualization visual={aiVisual} />;
  }

  if (!topics.length) {
    return <p className="py-4 text-center text-sm text-ink-faint">أضف مواضيع لهذه المادة لتظهر الخريطة المعرفية.</p>;
  }

  const stepY = 90;
  const w = 420;
  const h = Math.max(120, topics.length * stepY + 40);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="الخريطة المعرفية للمادة">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill="rgb(var(--brand-lighter))" />
          </marker>
        </defs>
        {topics.map((_, i) => {
          if (i === 0) return null;
          const y1 = 40 + (i - 1) * stepY;
          const y2 = 40 + i * stepY;
          return <line key={`e${i}`} x1={w / 2} y1={y1 + 18} x2={w / 2} y2={y2 - 18} stroke="rgb(var(--brand-lighter))" strokeWidth="1.5" markerEnd="url(#arrow)" />;
        })}
        {topics.map((t, i) => {
          const y = 40 + i * stepY;
          const state = masteryState(Number(t.mastery || 0));
          const meta = STATE_META[state] || STATE_META.untouched;
          return (
            <g key={t.id} onClick={() => { setSelected(t); onSelectTopic?.(t); }} className="cursor-pointer">
              <rect x={w / 2 - 90} y={y - 16} width="180" height="32" rx="16" fill="rgb(var(--card))" stroke={meta.color} strokeWidth="1.5" />
              <circle cx={w / 2 - 74} cy={y} r="5" fill={meta.color} />
              <text x={w / 2 + 4} y={y + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="rgb(var(--ink))">{t.title.slice(0, 22)}</text>
              <text x={w / 2 + 76} y={y + 3} textAnchor="end" fontSize="8" fill="rgb(var(--ink-faint))">{Math.round(Number(t.mastery || 0))}%</text>
            </g>
          );
        })}
      </svg>

      {selected && (
        <div className="rounded-xl border border-line bg-elevated/70 p-3 text-sm animate-fadeIn">
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-bold text-ink"><BookMarked className="h-4 w-4 text-brand-dark" /> {selected.title}</p>
            <span className="chip" style={{ color: STATE_META[masteryState(Number(selected.mastery || 0))].color }}>{STATE_META[masteryState(Number(selected.mastery || 0))].label}</span>
          </div>
          <p className="text-xs text-ink-soft">الإتقان: {Math.round(Number(selected.mastery || 0))}% {selected.last_reviewed ? `• آخر مراجعة ${selected.last_reviewed.slice(0, 10)}` : '• لم يُراجع بعد'}</p>
          {selected.notes && <p className="mt-1 text-xs text-ink-faint">{selected.notes.slice(0, 140)}</p>}
          <button type="button" className="btn-primary mt-2 !px-3 !py-1.5 text-xs" onClick={() => onSelectTopic?.(selected)}>
            <Play className="h-3.5 w-3.5" /> ابدأ ممارسة على هذا الموضوع
          </button>
        </div>
      )}
    </div>
  );
}
