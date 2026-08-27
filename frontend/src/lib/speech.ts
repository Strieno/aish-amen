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

import { api } from './api';
import { DEFAULT_AUDIO_SETTINGS, useAppStore } from './app-store';

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function readAloudSupported(): boolean {
  return typeof window !== 'undefined' && (typeof Audio !== 'undefined' || ttsSupported());
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

let currentAudio: HTMLAudioElement | null = null;
let currentAudioStop: (() => void) | null = null;
let currentSpeechRequest: AbortController | null = null;

export function stopSpeaking() {
  currentSpeechRequest?.abort();
  currentSpeechRequest = null;
  if (ttsSupported()) window.speechSynthesis.cancel();
  currentAudioStop?.();
}

export function isSpeaking(): boolean {
  return (ttsSupported() && window.speechSynthesis.speaking) || !!currentAudio;
}

function playAudioBase64(b64: string, format: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let audio: HTMLAudioElement | null = null;
    let settled = false;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`;
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentAudio = audio;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        if (currentAudioStop === stopPlayback) currentAudioStop = null;
        audio = null;
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        onEnd?.();
        if (error) reject(error);
        else resolve();
      };
      const stopPlayback = () => {
        audio?.pause();
        finish();
      };
      currentAudioStop = stopPlayback;
      audio.onplay = () => onStart?.();
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error('audio playback failed'));
      audio.play().catch((error) => {
        finish(error instanceof Error ? error : new Error('audio playback failed'));
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error('audio decode failed'));
    }
  });
}

function browserSpeak(opts: {
  text: string;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  stopSpeaking();
  if (!ttsSupported()) {
    opts.onEnd?.();
    return;
  }
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

export interface SpeakResult {
  engine: 'edge' | 'openai' | 'browser';
  ok: boolean;
  error?: string;
}

/**
 * Speak with a human neural voice.
 * Engine resolution (settings.audio.ttsEngine):
 *  - 'browser': system voices only.
 *  - 'server' : server neural TTS only (Edge free voice, or OpenAI provider).
 *  - 'auto'   : server neural TTS, falling back to browser voices.
 * Maximum-privacy mode forces browser-only (no cloud calls).
 */
export async function speak(opts: {
  text: string;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<SpeakResult> {
  const state = useAppStore.getState();
  const audio = { ...DEFAULT_AUDIO_SETTINGS, ...(state.settings.audio || {}) };
  const engine = audio.ttsEngine || 'auto';
  const maxPrivacy = state.settings.privacy?.maxPrivacy === true;

  const wantServer = engine !== 'browser' && !maxPrivacy;

  if (wantServer) {
    const requestController = new AbortController();
    currentSpeechRequest?.abort();
    currentSpeechRequest = requestController;
    try {
      const r = await api.postAbortable<{ ok?: boolean; engine?: string; format?: string; audio?: string; error?: string }>(
        '/ai/tts',
        {
          text: stripMarkdown(opts.text).slice(0, 4000),
          engine: engine === 'server' ? 'openai' : 'auto',
          provider_id: audio.ttsProviderId || undefined,
          model: audio.ttsModel || undefined,
          voice: audio.ttsVoice || undefined,
          voice_edge: audio.ttsVoiceEdge || undefined,
          speed: opts.rate ?? 1,
          lang: (opts.lang || 'ar-SA').toLowerCase().startsWith('en') ? 'en' : 'ar',
        },
        requestController.signal,
      );
      if (currentSpeechRequest === requestController) currentSpeechRequest = null;
      if (r.audio) {
        await playAudioBase64(r.audio, r.format || 'mp3', opts.onStart, opts.onEnd);
        return { engine: r.engine === 'openai' ? 'openai' : 'edge', ok: true };
      }
      throw new Error(r.error || 'empty response');
    } catch (error) {
      if (currentSpeechRequest === requestController) currentSpeechRequest = null;
      if (requestController.signal.aborted) {
        opts.onEnd?.();
        return { engine: 'openai', ok: false, error: 'cancelled' };
      }
      if (engine === 'server') {
        opts.onEnd?.();
        return { engine: 'openai', ok: false, error: error instanceof Error ? error.message : 'tts failed' };
      }
      // 'auto' → fall back to the browser voices.
    }
  }

  browserSpeak(opts);
  return { engine: 'browser', ok: true };
}
