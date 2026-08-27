/**
 * LivingGarden — a procedural garden where every achievement grows the plant.
 *   tasks   → leaves
 *   focus   → branches
 *   gratitude → flowers
 *   goals   → stars/fruits
 * Pure procedural SVG; no images. Empty state when nothing exists yet.
 */

export interface GardenStats {
  tasks?: number;
  focus?: number;
  gratitude?: number;
  goals?: number;
}

export default function LivingGarden({ stats = {}, className = '' }: { stats?: GardenStats; className?: string }) {
  const tasks = Math.max(0, Math.min(9, Math.floor(stats.tasks || 0)));
  const focus = Math.max(0, Math.min(7, Math.floor(stats.focus || 0)));
  const gratitude = Math.max(0, Math.min(7, Math.floor(stats.gratitude || 0)));
  const goals = Math.max(0, Math.min(6, Math.floor(stats.goals || 0)));

  const total = tasks + focus + gratitude + goals;
  if (total === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-card/40 p-6 text-center text-sm text-ink-faint ${className}`}>
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
          <path d="M36 58 V30 M36 42 Q30 34 24 34 M36 38 Q42 30 48 30 M36 34 Q30 26 26 24" fill="none" stroke="rgb(var(--line))" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <path d="M26 62 Q36 60 46 62" fill="none" stroke="rgb(var(--line))" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
        <p>حديقتك ستزهر مع إنجازاتك — مهمة، جلسة تركيز، امتنان، هدف.</p>
      </div>
    );
  }

  const leaves: { x: number; y: number; s: number; r: number; delay: string }[] = [];
  const branches: { x1: number; y1: number; x2: number; y2: number; delay: string }[] = [];
  const flowers: { x: number; y: number; s: number; delay: string }[] = [];
  const stars: { x: number; y: number; s: number; delay: string }[] = [];

  // Deterministic pseudo-positions spread on both sides of the stem.
  const seed = (n: number) => (Math.sin(n * 127.1) * 43758.5453) % 1;

  for (let i = 0; i < tasks; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = 26 + seed(i) * 24;
    leaves.push({ x: 36 + side * (14 + seed(i + 40) * 18), y, s: 7 + seed(i + 9) * 3, r: side * (28 + seed(i + 2) * 20), delay: `${seed(i) * 4}s` });
  }
  for (let i = 0; i < focus; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    branches.push({ x1: 36, y1: 36 + seed(i + 5) * 14, x2: 36 + side * (20 + seed(i + 7) * 14), y2: 22 + seed(i + 11) * 12, delay: `${seed(i) * 4}s` });
  }
  for (let i = 0; i < gratitude; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    flowers.push({ x: 36 + side * (12 + seed(i + 20) * 16), y: 30 + seed(i + 30) * 14, s: 6 + seed(i + 3) * 2, delay: `${seed(i + 1) * 4}s` });
  }
  for (let i = 0; i < goals; i++) {
    stars.push({ x: 36 + (seed(i + 50) - 0.5) * 40, y: 10 + seed(i + 60) * 12, s: 3.5 + seed(i) * 1.5, delay: `${seed(i + 4) * 4}s` });
  }

  return (
    <svg viewBox="0 0 72 72" className={`w-full max-w-56 ${className}`} role="img" aria-label={`حديقة عيش آمن: ${tasks} ورقة، ${focus} فرع، ${gratitude} زهرة، ${goals} نجمة`}>
      {/* ground */}
      <ellipse cx="36" cy="63" rx="24" ry="4" fill="rgb(var(--brand-soft))" />
      <path d="M22 62 Q36 66 50 62" fill="none" stroke="rgb(var(--brand-lighter))" strokeWidth="1.5" opacity="0.8" />

      {/* stem */}
      <path d="M36 60 V26" fill="none" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" />

      {/* branches */}
      {branches.map((b, i) => (
        <path key={`b${i}`} d={`M${b.x1} ${b.y1} Q${(b.x1 + b.x2) / 2} ${(b.y1 + b.y2) / 2 - 4} ${b.x2} ${b.y2}`} fill="none" stroke="rgb(var(--brand-accent))" strokeWidth="1.8" strokeLinecap="round" className="garden-branch" style={{ animationDelay: b.delay }} />
      ))}

      {/* leaves */}
      {leaves.map((l, i) => (
        <path
          key={`l${i}`}
          d={`M${l.x} ${l.y} Q${l.x + l.r * 0.4} ${l.y - l.s * 0.8} ${l.x + l.r} ${l.y - l.s} Q${l.x + l.r * 0.6} ${l.y + l.s * 0.4} ${l.x} ${l.y} Z`}
          fill="rgb(var(--brand-accent) / 0.85)"
          className="garden-leaf"
          style={{ animationDelay: l.delay }}
        />
      ))}

      {/* flowers */}
      {flowers.map((f, i) => (
        <g key={`f${i}`} className="garden-flower" style={{ animationDelay: f.delay }}>
          <circle cx={f.x} cy={f.y} r={f.s} fill="rgb(var(--brand-accent) / 0.3)" />
          {[0, 72, 144, 216, 288].map((a) => {
            const rad = (a * Math.PI) / 180;
            return <circle key={a} cx={f.x + Math.cos(rad) * f.s} cy={f.y + Math.sin(rad) * f.s} r={f.s * 0.5} fill="rgb(var(--warn) / 0.75)" />;
          })}
          <circle cx={f.x} cy={f.y} r={f.s * 0.5} fill="rgb(var(--brand-dark))" />
        </g>
      ))}

      {/* stars / fruits */}
      {stars.map((st, i) => (
        <g key={`s${i}`} className="mini-spark" style={{ animationDelay: st.delay }}>
          <circle cx={st.x} cy={st.y} r={st.s} fill="rgb(var(--warn))" />
          <circle cx={st.x} cy={st.y} r={st.s * 0.4} fill="rgb(var(--card))" opacity="0.8" />
        </g>
      ))}
    </svg>
  );
}
