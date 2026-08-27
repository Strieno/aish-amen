let ctx: AudioContext | null = null;
let uiSoundsEnabled = true;

export function setUiSoundsEnabled(on: boolean) {
  uiSoundsEnabled = on;
}

export function quietHoursActive(qh?: { enabled?: boolean; start?: string; end?: string }): boolean {
  if (!qh?.enabled || !qh.start || !qh.end) return false;
  const now = new Date();
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const start = qh.start.slice(0, 5);
  const end = qh.end.slice(0, 5);
  if (start <= end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

function ensureCtx(): AudioContext | null {
  if (!uiSoundsEnabled) return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  start?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
}

function tone({ freq, freqEnd, start = 0, dur = 0.12, type = 'sine', vol = 0.06 }: ToneOpts) {
  const ac = ensureCtx();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const playClick = () => tone({ freq: 640, freqEnd: 470, dur: 0.09, vol: 0.04 });

export const playSuccess = () => {
  tone({ freq: 523.25, dur: 0.13, vol: 0.07 });
  tone({ freq: 783.99, start: 0.11, dur: 0.18, vol: 0.07 });
};

export const playError = () => tone({ freq: 220, freqEnd: 150, dur: 0.2, type: 'triangle', vol: 0.07 });

export const playSend = () => tone({ freq: 480, freqEnd: 760, dur: 0.13, vol: 0.06 });

export const playMicOn = () => {
  tone({ freq: 880, dur: 0.1, vol: 0.06 });
  tone({ freq: 1174.66, start: 0.09, dur: 0.13, vol: 0.05 });
};

export const playMicOff = () => tone({ freq: 1174.66, freqEnd: 700, dur: 0.14, vol: 0.05 });

export const playToggle = (on: boolean) =>
  tone({ freq: on ? 700 : 460, freqEnd: on ? 920 : 300, dur: 0.11, vol: 0.045 });

export const playNotify = () => {
  tone({ freq: 659.25, dur: 0.16, vol: 0.06 });
  tone({ freq: 987.77, start: 0.17, dur: 0.22, vol: 0.06 });
};

/** Global delegation: a soft click for every interactive element. */
export function initUiSounds(): () => void {
  const handler = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    if (el.closest('[data-no-sound]')) return;
    const interactive = el.closest<HTMLElement>(
      'button, a[href], [role="button"], [role="switch"], [role="tab"], [role="option"], input[type="checkbox"], input[type="radio"], select',
    );
    if (!interactive) return;
    if ((interactive as HTMLButtonElement).disabled || interactive.getAttribute('aria-disabled') === 'true') return;
    playClick();
  };
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}
