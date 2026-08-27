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

export default function AmbientBackground() {
  return (
    <>
      <div className="ambient-layer" aria-hidden="true">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />

        {FLOATERS.map((f, i) =>
          f.type === 'ring' ? (
            <span
              key={i}
              className={`ambient-ring ${f.anim}`}
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
