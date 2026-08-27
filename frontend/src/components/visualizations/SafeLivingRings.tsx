/**
 * SafeLivingRings — activity rings in an original Aish Aman style.
 * Segments: { key, label, value (0..1), color ('brand'|'warn'|'danger'|'accent') }.
 * Shows an empty state when no segment has data.
 */

export interface RingSegment {
  key: string;
  label: string;
  value: number;
  color?: 'brand' | 'accent' | 'warn' | 'danger';
}

const RING_COLORS: Record<string, string> = {
  brand: 'rgb(var(--brand))',
  accent: 'rgb(var(--brand-accent))',
  warn: 'rgb(var(--warn))',
  danger: 'rgb(var(--danger))',
};

export default function SafeLivingRings({ segments, size = 150, className = '' }: { segments: RingSegment[]; size?: number; className?: string }) {
  const active = segments.filter((s) => s.value > 0);
  if (!active.length) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-card/40 p-6 text-center text-sm text-ink-faint ${className}`}>
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-line text-2xl" aria-hidden="true">
          ◌
        </span>
        <p>لا توجد بيانات كافية بعد — كل إنجاز سيملأ حلقة.</p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const stroke = Math.max(8, Math.round(size * 0.075));
  const radius = (size - stroke) / 2 - Math.round(size * 0.04);
  const segmentsPerRing = 1;
  void segmentsPerRing;

  // One ring per segment, offset so all are visible.
  return (
    <div className={`flex flex-wrap items-center justify-center gap-4 ${className}`}>
      {active.map((seg, i) => {
        const r = radius - i * (stroke + Math.round(size * 0.03));
        const circ = 2 * Math.PI * r;
        const dash = circ * Math.min(1, seg.value);
        const color = RING_COLORS[seg.color || 'brand'];
        return (
          <div key={seg.key} className="flex flex-col items-center gap-2">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${seg.label}: ${Math.round(seg.value * 100)}%`}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} opacity="0.6" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ - dash}`}
                transform={`rotate(-90 ${cx} ${cy})`}
                className="ring-segment transition-all duration-700"
                style={{ filter: `drop-shadow(0 0 6px ${color.replace('rgb(', 'rgba(').replace(')', ' / 0.55)')})` }}
              />
              <text x={cx} y={cy - 1} textAnchor="middle" fontSize={Math.round(size * 0.13)} fontWeight="800" fill="rgb(var(--ink))">
                {Math.round(seg.value * 100)}%
              </text>
              <text x={cx} y={cy + Math.round(size * 0.11)} textAnchor="middle" fontSize={Math.round(size * 0.065)} fill="rgb(var(--ink-faint))">
                {seg.label}
              </text>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
