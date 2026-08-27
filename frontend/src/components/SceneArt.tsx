import { useId } from 'react';

function uid(prefix: string, id: string) {
  return `${prefix}-${id.replace(/:/g, '')}`;
}

/** مشهد البيت الآمن — منزل هادئ تحت القمر والنجوم */
export function SafeHomeScene({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label="منزل آمن">
      <defs>
        <linearGradient id={uid('sky', id)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-soft))" />
          <stop offset="100%" stopColor="rgb(var(--card))" />
        </linearGradient>
        <linearGradient id={uid('roof', id)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-accent))" />
          <stop offset="100%" stopColor="rgb(var(--brand))" />
        </linearGradient>
        <linearGradient id={uid('shield', id)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-accent))" />
          <stop offset="100%" stopColor="rgb(var(--brand-dark))" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="188" height="148" rx="28" fill={`url(#${uid('sky', id)})`} />
      <circle cx="150" cy="40" r="16" fill="rgb(var(--warn) / 0.85)" />
      <circle cx="144" cy="36" r="15" fill={`url(#${uid('sky', id)})`} />
      {[
        [36, 30, 0], [66, 20, 0.6], [110, 46, 1.2], [178, 70, 0.3], [24, 74, 1],
      ].map(([x, y, d], i) => (
        <circle
          key={i}
          cx={x as number}
          cy={y as number}
          r="2.4"
          fill="rgb(var(--brand-accent) / 0.8)"
          className="animate-twinkle"
          style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }}
        />
      ))}

      <path d="M28 118 C34 104 46 96 60 96 C80 96 84 108 100 106 C118 104 120 88 140 88 C158 88 166 100 178 110 L178 130 L28 130 Z" fill="rgb(var(--brand-lighter) / 0.65)" />

      <g className="animate-breathe" style={{ transformOrigin: '100px 96px' }}>
        <rect x="52" y="74" width="96" height="58" rx="12" fill="rgb(var(--card))" stroke="rgb(var(--brand) / 0.35)" strokeWidth="2.5" />
        <path d="M46 80 L100 42 L154 80 L138 80 L138 132 L62 132 L62 80 Z" fill={`url(#${uid('roof', id)})`} stroke="rgb(var(--brand-dark) / 0.4)" strokeWidth="2" strokeLinejoin="round" />
        <rect x="86" y="104" width="28" height="28" rx="7" fill="rgb(var(--brand-soft))" stroke="rgb(var(--brand-dark) / 0.5)" strokeWidth="2" />
        <circle cx="108" cy="118" r="2.2" fill="rgb(var(--brand-dark))" />
        <rect x="70" y="90" width="18" height="16" rx="4" fill="rgb(var(--brand-lighter) / 0.9)" stroke="rgb(var(--brand) / 0.4)" strokeWidth="1.5" />
        <rect x="112" y="90" width="18" height="16" rx="4" fill="rgb(var(--brand-lighter) / 0.9)" stroke="rgb(var(--brand) / 0.4)" strokeWidth="1.5" />
      </g>

      <g className="animate-floatY" style={{ transformOrigin: '160px 130px' }}>
        <path
          d="M160 96 L185 108 L185 126 Q185 134 177 134 L160 134 Z"
          fill={`url(#${uid('shield', id)})`}
          stroke="rgb(var(--brand-dark) / 0.35)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M168 113 L174 119 L180 111" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <path d="M34 150 C60 140 140 140 166 150 L166 160 L34 160 Z" fill="rgb(var(--brand-lighter) / 0.8)" />
    </svg>
  );
}

/** مشهد النمو — نبتة تتراقص أوراقها */
export function GrowthScene({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label="نمو">
      <defs>
        <linearGradient id={uid('pot', id)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-accent))" />
          <stop offset="100%" stopColor="rgb(var(--brand-dark))" />
        </linearGradient>
        <linearGradient id={uid('leaf', id)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-accent))" />
          <stop offset="100%" stopColor="rgb(var(--brand))" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="188" height="148" rx="28" fill="rgb(var(--brand-soft) / 0.8)" />
      <circle cx="42" cy="42" r="24" fill="rgb(var(--brand-lighter) / 0.9)" className="animate-breathe" style={{ transformOrigin: '42px 42px' }} />
      <circle cx="166" cy="36" r="10" fill="rgb(var(--brand-accent) / 0.35)" className="animate-twinkle" style={{ transformOrigin: '166px 36px' }} />
      <circle cx="176" cy="86" r="5" fill="rgb(var(--brand-accent) / 0.3)" className="animate-twinkle" style={{ animationDelay: '1.1s', transformOrigin: '176px 86px' }} />

      <path d="M100 84 Q96 52 76 44 Q74 66 88 80 Z" fill={`url(#${uid('leaf', id)})`} className="animate-floatY" style={{ transformOrigin: '88px 62px' }} />
      <path d="M100 84 Q104 48 128 40 Q128 64 112 80 Z" fill={`url(#${uid('leaf', id)})`} className="animate-floatY" style={{ animationDelay: '0.9s', transformOrigin: '112px 60px' }} />
      <path d="M100 86 L100 44 Q100 36 92 36 Q100 44 100 86 Z" fill="rgb(var(--brand))" />
      <g className="animate-floatYSlow" style={{ transformOrigin: '140px 36px' }}>
        <path d="M136 44 Q140 24 158 22 Q166 36 148 46 Z" fill="rgb(var(--brand-accent) / 0.85)" />
      </g>

      <path d="M70 100 L130 100 L138 136 Q138 146 128 146 L72 146 Q62 146 62 136 Z" fill={`url(#${uid('pot', id)})`} />
      <rect x="64" y="96" width="72" height="10" rx="5" fill="rgb(var(--brand-dark))" />
      <path d="M34 150 C60 142 140 142 166 150 L166 160 L34 160 Z" fill="rgb(var(--brand-lighter) / 0.7)" />
    </svg>
  );
}

/** مشهد التركيز — حلقة وقت هادئة تدور */
export function FocusScene({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label="تركيز">
      <defs>
        <linearGradient id={uid('arc', id)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-accent))" />
          <stop offset="100%" stopColor="rgb(var(--brand))" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="188" height="148" rx="28" fill="rgb(var(--brand-soft) / 0.8)" />

      <g className="animate-spinSlow" style={{ transformOrigin: '100px 80px' }}>
        <circle cx="100" cy="80" r="52" fill="none" stroke="rgb(var(--brand-lighter))" strokeWidth="3" strokeDasharray="4 10" strokeLinecap="round" />
      </g>
      <g className="animate-spinSlowReverse" style={{ transformOrigin: '100px 80px' }}>
        <circle cx="100" cy="80" r="40" fill="none" stroke={`url(#${uid('arc', id)})`} strokeWidth="6" strokeLinecap="round" strokeDasharray="190 61" />
        <circle cx="100" cy="40" r="7" fill={`url(#${uid('arc', id)})`} className="ring-glow" />
      </g>

      <g className="animate-breathe" style={{ transformOrigin: '100px 80px' }}>
        <circle cx="100" cy="80" r="26" fill="rgb(var(--card))" stroke="rgb(var(--brand) / 0.4)" strokeWidth="2" />
        <path d="M92 70 L92 82 L104 82 L104 90 L116 78 L104 78 L104 70 Z" fill={`url(#${uid('arc', id)})`} />
      </g>

      <circle cx="36" cy="42" r="5" fill="rgb(var(--brand-accent) / 0.4)" className="animate-twinkle" style={{ transformOrigin: '36px 42px' }} />
      <circle cx="166" cy="116" r="6" fill="rgb(var(--brand-accent) / 0.35)" className="animate-twinkle" style={{ animationDelay: '1.4s', transformOrigin: '166px 116px' }} />
      <circle cx="172" cy="34" r="3" fill="rgb(var(--brand) / 0.35)" className="animate-twinkle" style={{ animationDelay: '0.7s', transformOrigin: '172px 34px' }} />
      <circle cx="28" cy="112" r="3" fill="rgb(var(--brand) / 0.3)" className="animate-twinkle" style={{ animationDelay: '2s', transformOrigin: '28px 112px' }} />
    </svg>
  );
}

/** مشهد هادئ للحالات الفارغة — قمر ونجوم ونبتة صغيرة */
export function CalmEmptyScene({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 120" className={className} role="img" aria-label="مساحة هادئة">
      <defs>
        <linearGradient id={uid('bg', id)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-soft))" />
          <stop offset="100%" stopColor="rgb(var(--card))" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="192" height="112" rx="24" fill={`url(#${uid('bg', id)})`} />
      <circle cx="152" cy="34" r="13" fill="rgb(var(--warn) / 0.8)" className="animate-floatYSlow" style={{ transformOrigin: '152px 34px' }} />
      <circle cx="148" cy="31" r="12" fill={`url(#${uid('bg', id)})`} />
      {[[40, 26, 0], [70, 52, 0.8], [176, 62, 0.4], [26, 64, 1.6]].map(([x, y, d], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="2" fill="rgb(var(--brand-accent) / 0.75)" className="animate-twinkle" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }} />
      ))}
      <path d="M24 96 Q30 84 42 82 Q46 70 58 70 Q70 70 72 82 Q86 82 92 96 L92 112 L24 112 Z" fill="rgb(var(--brand-lighter) / 0.7)" />
      <g className="animate-floatY" style={{ transformOrigin: '130px 70px' }}>
        <path d="M124 86 Q120 70 132 64 Q142 70 136 86 Z" fill="rgb(var(--brand))" />
        <path d="M130 84 L130 96" stroke="rgb(var(--brand-dark))" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M118 100 L142 100 L146 112 L114 112 Z" fill="rgb(var(--brand-accent))" />
      </g>
    </svg>
  );
}
