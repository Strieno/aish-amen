interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export interface RecognitionController {
  stop: () => void;
}

export function sttSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startRecognition(opts: {
  lang: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}): RecognitionController | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;

  let stopped = false;
  let rec: SpeechRecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }

  rec.lang = opts.lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event: SpeechRecognitionEventLike) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final.trim()) opts.onFinal?.(final.trim());
    if (interim.trim()) opts.onInterim?.(interim.trim());
  };

  rec.onerror = (event) => {
    if (stopped) return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      opts.onError?.('mic-denied');
    } else if (event.error === 'no-speech') {
      opts.onError?.('no-speech');
    } else {
      opts.onError?.(event.error);
    }
  };

  rec.onend = () => {
    if (!stopped) opts.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

/* ============ Text-to-Speech ============ */

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function pickVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (!voices.length) return null;
  const wanted = langCode.toLowerCase().replace('_', '-');
  const prefix = wanted.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
    null
  );
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z]*/g, ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(opts: {
  text: string;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  if (!ttsSupported() || !opts.text.trim()) return;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(opts.text));
  const lang = opts.lang || 'ar-SA';
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = lang;
  utterance.rate = opts.rate ?? 1;
  utterance.pitch = 1;
  utterance.onstart = () => opts.onStart?.();
  utterance.onend = () => opts.onEnd?.();
  utterance.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return ttsSupported() && window.speechSynthesis.speaking;
}
