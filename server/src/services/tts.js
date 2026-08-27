import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { uid } from '../lib/util.js';

/**
 * Neural text-to-speech.
 *
 * Two engines:
 *  - Edge: Microsoft's free neural voices (very human, no API key).
 *  - OpenAI: any OpenAI-compatible provider exposing /audio/speech
 *    (tts-1) with the Alloy voice.
 */

let edgeTTSModule = null;
async function getEdgeTTS() {
  if (edgeTTSModule === null) {
    try {
      edgeTTSModule = await import('node-edge-tts');
    } catch {
      edgeTTSModule = false;
    }
  }
  return edgeTTSModule || null;
}

export const EDGE_AR = 'ar-EG-SalmaNeural';
export const EDGE_EN = 'en-US-AriaNeural';

export const EDGE_VOICES = [
  { id: 'auto', label: 'تلقائي حسب اللغة' },
  { id: 'ar-EG-SalmaNeural', label: 'سلمى — عربية (مصر) أنثى' },
  { id: 'ar-SA-ZariyahNeural', label: 'زارية — عربية (السعودية) أنثى' },
  { id: 'ar-SA-HamedNeural', label: 'حامد — عربية (السعودية) ذكر' },
  { id: 'ar-AE-FatimaNeural', label: 'فاطمة — عربية (الإمارات) أنثى' },
  { id: 'en-US-AriaNeural', label: 'Aria — English (US) female' },
  { id: 'en-US-GuyNeural', label: 'Guy — English (US) male' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia — English (UK) female' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — English (UK) male' },
];

export const OPENAI_VOICES = ['auto', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

export function edgeVoiceFor(lang, chosen) {
  if (chosen && chosen !== 'auto') return chosen;
  return lang === 'en' ? EDGE_EN : EDGE_AR;
}

export function openaiVoiceFor(lang, chosen) {
  if (chosen && chosen !== 'auto') return chosen;
  return 'alloy';
}

/** Synthesize speech with Microsoft Edge neural voices (free, no key). */
export async function synthesizeEdge({ text, voice, rate = 1, lang = 'ar' }) {
  const mod = await getEdgeTTS();
  if (!mod) throw new Error('أصوات الخادم غير متاحة — شغّل npm install في مجلد server');
  const pct = Math.round((rate - 1) * 100);
  const rateStr = `${pct >= 0 ? '+' : ''}${pct}%`;
  const file = path.join(tmpdir(), `aish-tts-${uid('e')}.mp3`);
  const tts = new mod.EdgeTTS({
    voice: edgeVoiceFor(lang, voice),
    rate: rateStr,
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    timeout: 30000,
  });
  await tts.ttsPromise(text, file);
  const buf = readFileSync(file);
  try {
    unlinkSync(file);
  } catch {
    /* temp cleanup is best-effort */
  }
  return buf;
}

/** Synthesize speech through an OpenAI-compatible /audio/speech endpoint. */
export async function synthesizeOpenAI({ provider, text, model, voice, speed = 1 }) {
  if (!provider || typeof provider.tts !== 'function') {
    throw new Error('المزود المحدد لا يدعم توليد الصوت (يتطلب نقطة /audio/speech)');
  }
  return provider.tts({ text, model, voice, speed });
}
