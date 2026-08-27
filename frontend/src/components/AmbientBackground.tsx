/**
 * Ambient Living Background — a slow, calm layer that shifts subtly with the
 * time of day. Uses only transform/opacity animations and respects
 * prefers-reduced-motion.
 */

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h >= 5 && h < 11) return 'dawn';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

const FLOATERS = [
  { type: 'ring', size: 90, top: '12%', left: '18%', anim: 'animate-floatYSlow', delay: '0s', opacity: 0.9 },
  { type: 'dot', size: 6, top: '22%', left: '78%', anim: 'animate-twinkle', delay: '0.4s', opacity: 1 },
  { type: 'ring', size: 44, top: '68%', left: '12%', anim: 'animate-floatY', delay: '0.8s', opacity: 0.8 },
  { type: 'dot', size: 4, top: '55%', left: '62%', anim: 'animate-twinkle', delay: '1.6s', opacity: 1 },
  { type: 'ring', size: 120, top: '74%', left: '70%', anim: 'animate-spinSlow', delay: '0s', opacity: 0.7 },
  { type: 'dot', size: 5, top: '8%', left: '52%', anim: 'animate-twinkle', delay: '2.2s', opacity: 1 },
  { type: 'ring', size: 30, top: '30%', left: '34%', anim: 'animate-floatX', delay: '0.5s', opacity: 0.85 },
  { type: 'dot', size: 4, top: '84%', left: '40%', anim: 'animate-twinkle', delay: '1s', opacity: 1 },
  { type: 'ring', size: 60, top: '42%', left: '88%', anim: 'animate-floatY', delay: '1.4s', opacity: 0.75 },
  { type: 'dot', size: 7, top: '90%', left: '88%', anim: 'animate-twinkle', delay: '0.2s', opacity: 1 },
];

// Warm at dawn/dusk, bright at day, deep at night.
const TIME_TINTS: Record<TimeOfDay, { gradient: string; blobOpacity: number }> = {
  dawn: { gradient: 'linear-gradient(180deg, rgb(var(--warn) / 0.10), transparent 40%)', blobOpacity: 0.45 },
  day: { gradient: 'linear-gradient(180deg, rgb(var(--brand-accent) / 0.08), transparent 45%)', blobOpacity: 0.5 },
  dusk: { gradient: 'linear-gradient(180deg, rgb(var(--warn) / 0.12), transparent 45%)', blobOpacity: 0.4 },
  night: { gradient: 'linear-gradient(180deg, rgb(var(--brand-dark) / 0.14), transparent 50%)', blobOpacity: 0.3 },
};

export default function AmbientBackground() {
  const tint = TIME_TINTS[timeOfDay()];
  return (
    <>
      <div className="ambient-layer" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{ background: tint.gradient, opacity: 0.6, transition: 'opacity 2s ease, background 2s ease' }}
        />
        <div className="ambient-blob ambient-blob-1" style={{ opacity: tint.blobOpacity }} />
        <div className="ambient-blob ambient-blob-2" style={{ opacity: tint.blobOpacity }} />
        <div className="ambient-blob ambient-blob-3" style={{ opacity: tint.blobOpacity }} />

        {FLOATERS.map((f, i) =>
          f.type === 'ring' ? (
            <span
              key={i}
              className={`ambient-ring ${f.anim} ambient-ring-mobile`}
              style={{
                width: f.size,
                height: f.size,
                top: f.top,
                left: f.left,
                opacity: f.opacity,
                animationDelay: f.delay,
              }}
            />
          ) : (
            <span
              key={i}
              className={`ambient-dot ${f.anim}`}
              style={{
                width: f.size,
                height: f.size,
                top: f.top,
                left: f.left,
                opacity: f.opacity,
                animationDelay: f.delay,
              }}
            />
          ),
        )}
      </div>
      <div className="ambient-vignette" aria-hidden="true" />
    </>
  );
}
