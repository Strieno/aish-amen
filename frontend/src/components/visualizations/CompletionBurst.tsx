/**
 * CompletionBurst — soft celebration micro-interactions.
 * Dispatches a gentle particle burst + glowing ripple at the given coordinates
 * (or centered). Mounted once in App; other components call `celebrate()`.
 *
 * Usage:
 *   import { celebrate } from './visualizations/CompletionBurst';
 *   celebrate();                      // centered soft burst
 *   celebrate({ x, y });              // at pointer position
 */

import { useEffect, useRef, useState } from 'react';

export interface CelebrateOptions {
  x?: number;
  y?: number;
  text?: string;
}

export function celebrate(opts: CelebrateOptions = {}) {
  window.dispatchEvent(new CustomEvent('aish:celebrate', { detail: opts }));
}

interface Burst {
  id: number;
  x: number;
  y: number;
  text?: string;
}

const COLORS = ['var(--brand-accent)', 'var(--brand)', 'var(--warn)', 'var(--brand-lighter)'];

export default function CompletionBurst() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const onCelebrate = (e: Event) => {
      const detail = (e as CustomEvent<CelebrateOptions>).detail || {};
      const id = ++nextId.current;
      const fallbackX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
      const fallbackY = typeof window !== 'undefined' ? window.innerHeight * 0.4 : 0;
      setBursts((prev) => [...prev, { id, x: detail.x ?? fallbackX, y: detail.y ?? fallbackY, text: detail.text }]);
      window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 950);
    };
    window.addEventListener('aish:celebrate', onCelebrate);
    return () => window.removeEventListener('aish:celebrate', onCelebrate);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {bursts.map((b) => (
        <div key={b.id} className="absolute" style={{ left: b.x, top: b.y }}>
          <span className="celebrate-ripple block h-6 w-6 -translate-x-1/2 -translate-y-1/2" />
          {[0, 60, 120, 180, 240, 300].map((a, i) => {
            const rad = (a * Math.PI) / 180;
            return (
              <span
                key={i}
                className="celebrate-burst block h-2 w-2 -translate-x-1/2 -translate-y-1/2"
                style={{
                  background: COLORS[i % COLORS.length],
                  ['--dx' as string]: `${Math.cos(rad) * 44}px`,
                  ['--dy' as string]: `${Math.sin(rad) * 34}px`,
                  animationDelay: `${i * 0.02}s`,
                }}
              />
            );
          })}
          {b.text && (
            <span className="absolute left-1/2 top-4 -translate-x-1/2 animate-fadeIn rounded-pill bg-brand px-3 py-1 text-xs font-bold text-white shadow-button">
              {b.text}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
