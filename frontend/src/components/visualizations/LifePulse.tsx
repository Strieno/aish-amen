/**
 * LifePulse — an abstract line showing today's progress across life dimensions.
 * Not an ECG; a calm, organic rhythm of the day. Pure SVG, RTL-aware labels,
 * with hover tooltips per point.
 */

export interface PulsePoint {
  key: string;
  label: string;
  value: number; // 0..1
}

export default function LifePulse({ points, className = '' }: { points: PulsePoint[]; className?: string }) {
  const w = 320;
  const h = 84;
  const pad = 14;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  if (!points.length) {
    return (
      <div className={`flex h-20 items-center justify-center text-xs text-ink-faint ${className}`}>
        ابدأ يومك لترى نبضه هنا.
      </div>
    );
  }

  const step = innerW / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => ({
    x: pad + i * step,
    y: pad + innerH - p.value * innerH,
    p,
  }));

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${pad + innerH} L ${pad} ${pad + innerH} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`w-full ${className}`}
      role="img"
      aria-label="نبض اليوم — تقدم الحياة عبر الأبعاد المختلفة"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand) / 0.35)" />
          <stop offset="100%" stopColor="rgb(var(--brand) / 0.02)" />
        </linearGradient>
      </defs>

      {/* grid guide */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + innerH * (1 - g)} y2={pad + innerH * (1 - g)} stroke="rgb(var(--line))" strokeWidth="0.6" strokeDasharray="2 5" opacity="0.6" />
      ))}

      <path d={area} fill="url(#lp-fill)" />
      <path d={path} fill="none" stroke="rgb(var(--brand-accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pulse-line" />

      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="8" fill="transparent" role="button" aria-label={c.p.label} tabIndex={0}>
            <title>{`${c.p.label}: ${Math.round(c.p.value * 100)}%`}</title>
          </circle>
          <circle cx={c.x} cy={c.y} r="2.6" fill="rgb(var(--card))" stroke="rgb(var(--brand-accent))" strokeWidth="1.6" className="pulse-dot" />
        </g>
      ))}

      {/* labels */}
      {coords.map((c, i) => (
        <text key={`l${i}`} x={c.x} y={h - 3} textAnchor="middle" fontSize="8.5" fill="rgb(var(--ink-faint))">
          {c.p.label}
        </text>
      ))}
    </svg>
  );
}
