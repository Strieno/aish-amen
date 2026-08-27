/**
 * PageBackdrop — a subtle, per-page decorative backdrop (one per page).
 * Variants:
 *   'breath'      → chat: slow breathing gradient
 *   'study'       → abstract knowledge nodes
 *   'stars'       → gratitude: tiny twinkling light points
 *   'path'        → goals: a dotted forward path
 *   'rings'       → safe living: faint nested rings
 *   'memory'      → faint constellation dots
 * Respects prefers-reduced-motion via the shared CSS classes.
 */

import { useMemo } from 'react';

export type BackdropVariant = 'breath' | 'study' | 'stars' | 'path' | 'rings' | 'memory';

const DOT_COUNT = 18;

export default function PageBackdrop({ variant, className = '' }: { variant: BackdropVariant; className?: string }) {
  const dots = useMemo(() => {
    return Array.from({ length: DOT_COUNT }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      top: `${(i * 53) % 100}%`,
      size: 2 + ((i * 7) % 3),
      delay: `${(i % 6) * 0.7}s`,
      r: `${Math.round(14 + ((i * 13) % 20))}px`,
    }));
  }, []);

  const nodes = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        left: `${12 + ((i * 31) % 76)}%`,
        top: `${16 + ((i * 47) % 68)}%`,
        size: 5 + ((i * 5) % 6),
        delay: `${(i % 5) * 0.8}s`,
      })),
    [],
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${(i * 41) % 100}%`,
        top: `${(i * 29) % 92}%`,
        size: 2 + ((i * 3) % 3),
        delay: `${(i % 7) * 0.6}s`,
      })),
    [],
  );

  if (variant === 'breath') {
    return <div className={`backdrop backdrop-breath ${className}`} aria-hidden="true" />;
  }

  if (variant === 'study') {
    return (
      <div className={`backdrop ${className}`} aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full opacity-[0.35]" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          {nodes.map((n, i) => (
            <g key={i}>
              <circle cx={n.left} cy={n.top} r={n.size} fill="rgb(var(--brand-accent) / 0.7)" className="constellation-node" style={{ animationDelay: n.delay }} />
              {nodes[i + 1] && <line x1={n.left} y1={n.top} x2={nodes[i + 1].left} y2={nodes[i + 1].top} stroke="rgb(var(--brand) / 0.35)" strokeWidth="0.8" className="constellation-link" />}
            </g>
          ))}
        </svg>
      </div>
    );
  }

  if (variant === 'stars') {
    return (
      <div className={`backdrop ${className}`} aria-hidden="true">
        {stars.map((s, i) => (
          <span key={i} className="ambient-dot animate-twinkle" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
        ))}
      </div>
    );
  }

  if (variant === 'path') {
    return (
      <div className={`backdrop ${className}`} aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full opacity-[0.4]" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <path d="M-10 170 Q 80 60, 160 130 T 340 70 T 420 100" fill="none" stroke="rgb(var(--brand-accent) / 0.5)" strokeWidth="2" strokeDasharray="3 8" className="pulse-line" />
          {dots.slice(0, 6).map((d, i) => (
            <circle key={i} cx={30 + i * 62} cy={100 + Math.sin(i * 1.4) * 60} r="5" fill="rgb(var(--brand-accent) / 0.6)" className="constellation-node" style={{ animationDelay: d.delay }} />
          ))}
        </svg>
      </div>
    );
  }

  if (variant === 'rings') {
    return (
      <div className={`backdrop ${className}`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="ambient-ring animate-spinSlow"
            style={{
              width: `${180 + i * 110}px`,
              height: `${180 + i * 110}px`,
              right: `${-40 + i * 30}px`,
              bottom: `${-60 + i * 20}px`,
              animationDuration: `${34 + i * 10}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // memory
  return (
    <div className={`backdrop ${className}`} aria-hidden="true">
      {dots.map((d, i) => (
        <span key={i} className="ambient-dot animate-twinkle" style={{ left: d.left, top: d.top, width: d.size, height: d.size, animationDelay: d.delay }} />
      ))}
    </div>
  );
}
