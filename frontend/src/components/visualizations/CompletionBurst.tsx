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

export interface CinematicOptions {
  title: string;
  subtitle?: string;
  icon?: string;
}

/** A short full-screen cinematic moment (achievements, level-ups). */
export function cinematicCelebrate(opts: CinematicOptions) {
  window.dispatchEvent(new CustomEvent('aish:cinematic', { detail: opts }));
}

interface Burst {
  id: number;
  x: number;
  y: number;
  text?: string;
}

interface Cinematic {
  id: number;
  title: string;
  subtitle?: string;
  icon?: string;
}

const COLORS = ['var(--brand-accent)', 'var(--brand)', 'var(--warn)', 'var(--brand-lighter)'];

const ICONS: Record<string, string> = {
  trophy: '🏆', fire: '🔥', check: '✓', list: '☑', timer: '⏱', brain: '🧠',
  book: '📘', pen: '✍️', heart: '💚', archive: '🗃', flag: '🚩', shield: '🛡',
  moon: '🌙', zap: '⚡', sun: '🌅', refresh: '🔄', dice: '🎲', star: '✨',
};

export default function CompletionBurst() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [cinematics, setCinematics] = useState<Cinematic[]>([]);
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
    const onCinematic = (e: Event) => {
      const detail = (e as CustomEvent<CinematicOptions>).detail || {};
      const id = ++nextId.current;
      setCinematics((prev) => [...prev, { id, title: detail.title, subtitle: detail.subtitle, icon: detail.icon }]);
      window.setTimeout(() => setCinematics((prev) => prev.filter((c) => c.id !== id)), 2400);
    };
    window.addEventListener('aish:celebrate', onCelebrate);
    window.addEventListener('aish:cinematic', onCinematic);
    return () => {
      window.removeEventListener('aish:celebrate', onCelebrate);
      window.removeEventListener('aish:cinematic', onCinematic);
    };
  }, []);

  return (
    <>
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

      {/* Cinematic achievement moments */}
      {cinematics.map((c) => (
        <div key={c.id} className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" aria-hidden="true">
          <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" style={{ animation: 'cinematicVignette 2.4s ease-out both' }} />
          <div className="relative flex flex-col items-center px-6 text-center" style={{ animation: 'cinematicRise 2.4s ease-out both' }}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
              const rad = (a * Math.PI) / 180;
              return (
                <span
                  key={i}
                  className="celebrate-burst absolute block h-2.5 w-2.5"
                  style={{
                    background: COLORS[i % COLORS.length],
                    ['--dx' as string]: `${Math.cos(rad) * 130}px`,
                    ['--dy' as string]: `${Math.sin(rad) * 90}px`,
                    animationDelay: `${0.1 + i * 0.04}s`,
                  }}
                />
              );
            })}
            <span className="mb-3 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-accent via-brand to-brand-dark text-4xl shadow-button ring-glow">
              {c.icon ? ICONS[c.icon] || '✨' : '✨'}
            </span>
            <p className="text-2xl font-extrabold text-ink">{c.title}</p>
            {c.subtitle && <p className="mt-1 max-w-xs text-sm text-ink-soft">{c.subtitle}</p>}
          </div>
        </div>
      ))}
    </>
  );
}
