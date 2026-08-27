/**
 * MemoryConstellation — memories as nodes in a calm constellation,
 * linked by shared source/type/tags. Hover shows memory text + date + source.
 * Pure visualization on top of the existing memory data.
 */

import { useMemo, useState } from 'react';

export interface ConstellationMemory {
  id: string;
  content: string;
  type?: string;
  source?: string;
  importance?: number;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

interface Node {
  x: number;
  y: number;
  r: number;
  m: ConstellationMemory;
  key: string;
}

export default function MemoryConstellation({ memories, className = '' }: { memories: ConstellationMemory[]; className?: string }) {
  const [hover, setHover] = useState<ConstellationMemory | null>(null);
  const W = 560;
  const H = 240;

  const nodes = useMemo<Node[]>(() => {
    const list = memories.slice(0, 30);
    return list.map((m, i) => {
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2;
      const radius = 60 + ((i * 37) % 70);
      return {
        x: W / 2 + Math.cos(angle) * radius + ((i * 53) % 40) - 20,
        y: H / 2 + Math.sin(angle) * radius * 0.6,
        r: 3.5 + Math.min(4, Number(m.importance ?? 0.4) * 5),
        m,
        key: m.id,
      };
    });
  }, [memories]);

  // Link nodes that share a source or a tag.
  const links = useMemo(() => {
    const out: Array<[Node, Node]> = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].m;
        const b = nodes[j].m;
        const sharedTag = (a.tags || []).some((t) => (b.tags || []).includes(t));
        const sameSource = a.source && b.source && a.source === b.source;
        const sameType = a.type && b.type && a.type === b.type;
        if (sharedTag || sameSource || sameType) {
          out.push([nodes[i], nodes[j]]);
          if (out.length >= 40) break;
        }
      }
      if (out.length >= 40) break;
    }
    return out;
  }, [nodes]);

  if (!memories.length) {
    return (
      <div className={`rounded-card border border-dashed border-line bg-card/40 p-6 text-center text-sm text-ink-faint ${className}`}>
        ذكرياتك ستتصل ككوكبات هنا كلما حفظت أكثر.
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="كوكبة الذكريات — كل نقطة ذكرى، والخطوط روابط مشتركة">
        {links.map(([a, b], i) => (
          <line key={`ln${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(var(--brand-accent))" strokeWidth="0.6" opacity="0.45" className="constellation-link" />
        ))}
        {nodes.map((n) => (
          <g key={n.key} onMouseEnter={() => setHover(n.m)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
            <circle cx={n.x} cy={n.y} r={n.r + 5} fill="transparent" role="button" tabIndex={0} aria-label={n.m.content.slice(0, 60)} onFocus={() => setHover(n.m)} onBlur={() => setHover(null)} />
            <circle cx={n.x} cy={n.y} r={n.r} fill="rgb(var(--brand-accent))" className="constellation-node" style={{ filter: `drop-shadow(0 0 4px rgb(var(--brand-accent) / 0.6))` }} />
          </g>
        ))}
      </svg>

      {hover && (
        <div className="pointer-events-none absolute end-3 top-3 max-w-72 animate-fadeIn rounded-xl border border-line bg-card/95 p-3 shadow-card backdrop-blur" aria-live="polite">
          <p className="text-sm font-bold text-ink">{hover.content.slice(0, 90)}{hover.content.length > 90 ? '…' : ''}</p>
          <p className="mt-1 text-[11px] text-ink-faint">
            {hover.source ? `المصدر: ${hover.source}` : ''} {hover.type ? ` • ${hover.type}` : ''}
            {(() => { const d = hover.created_at || hover.updated_at; return d ? ` • ${d.slice(0, 10)}` : ''; })()}
          </p>
        </div>
      )}
    </div>
  );
}
