/**
 * SafeLivingOrb — the calm centerpiece of Aish Aman.
 * A breathing orb whose size, glow and particles respond to the day's level.
 *
 *  level: 'stable' | 'slightly-overloaded' | 'overloaded' (from /dashboard/today)
 *  score: 0..100  (optional day score displayed inside)
 */

export interface OrbProps {
  level?: 'stable' | 'slightly-overloaded' | 'overloaded';
  score?: number | null;
  size?: number;
  className?: string;
}

const LEVEL_CONFIG = {
  stable: { glow: 0.7, breathe: '5.5s', particles: 6, label: 'يوم آمن' },
  'slightly-overloaded': { glow: 0.45, breathe: '7s', particles: 3, label: 'يوم متزن' },
  overloaded: { glow: 0.3, breathe: '9s', particles: 1, label: 'يوم محمّل' },
};

const PARTICLES = [
  { dx: 14, dy: -16, size: 4, delay: '0s' },
  { dx: -16, dy: -8, size: 3, delay: '0.8s' },
  { dx: 12, dy: 14, size: 3, delay: '1.5s' },
  { dx: -10, dy: 18, size: 4, delay: '2.2s' },
  { dx: 20, dy: 4, size: 2.5, delay: '0.4s' },
  { dx: -20, dy: 6, size: 2.5, delay: '1.1s' },
];

export default function SafeLivingOrb({ level = 'stable', score = null, size = 148, className = '' }: OrbProps) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.stable;
  const core = Math.round(size * 0.46);
  const particles = PARTICLES.slice(0, cfg.particles);

  return (
    <div
      className={`orb-shell ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`حالة اليوم: ${cfg.label}${score != null ? `، درجة ${score}` : ''}`}
    >
      <div className="orb-halo" style={{ animationDuration: cfg.breathe }} />
      <div
        className="orb-core"
        style={{
          width: core,
          height: core,
          animationDuration: cfg.breathe,
          boxShadow: `0 0 ${Math.round(size * 0.3)}px -8px rgb(var(--brand-accent) / ${cfg.glow}), 0 0 ${Math.round(size * 0.7)}px -20px rgb(var(--brand) / ${cfg.glow * 0.8}), inset 0 -8px 24px rgb(0 0 0 / 0.18)`,
        }}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          className="orb-particle"
          style={{
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
          }}
        />
      ))}
      <div className="relative z-10 flex flex-col items-center leading-none">
        {score != null && <span className="text-2xl font-extrabold text-white" style={{ fontSize: size * 0.24 }}>{score}</span>}
        <span className="mt-1 font-bold text-white/85" style={{ fontSize: size * 0.085 }}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}
