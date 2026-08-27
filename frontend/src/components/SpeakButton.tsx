import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import { readAloudSupported, speak, stopSpeaking } from '../lib/speech';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

/** Read-aloud button (text to speech). Hidden when disabled in settings. */
export default function SpeakButton({ text, className = '' }: { text: string; className?: string }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const voiceLang = useAppStore((s) => s.settings.audio?.voiceLang);
  const rate = useAppStore((s) => s.settings.audio?.speechRate ?? 1);
  const ttsEnabled = useAppStore((s) => s.settings.audio?.ttsEnabled !== false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const idRef = useRef(0);

  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  if (!ttsEnabled || !readAloudSupported()) return null;

  const resolveLang = () => {
    if (voiceLang && voiceLang !== 'auto') return voiceLang;
    return lang === 'en' ? 'en-US' : 'ar-SA';
  };

  const toggle = async () => {
    if (status === 'playing' || status === 'loading') {
      ++idRef.current;
      stopSpeaking();
      setStatus('idle');
      return;
    }
    stopSpeaking();
    const id = ++idRef.current;
    setStatus('loading');
    const result = await speak({
      text,
      lang: resolveLang(),
      rate,
      onStart: () => {
        if (idRef.current === id) setStatus('playing');
      },
      onEnd: () => {
        if (idRef.current === id) setStatus('idle');
      },
    });
    if (idRef.current === id && !result.ok && result.error !== 'cancelled') setStatus('error');
  };

  const active = status === 'loading' || status === 'playing';

  return (
    <button
      type="button"
      data-no-sound
      onClick={toggle}
      className={`btn-icon ${className}`}
      title={status === 'error' ? t('chat.speechError') : active ? t('chat.stopSpeaking') : t('chat.speak')}
      aria-label={active ? t('chat.stopSpeaking') : t('chat.speak')}
      aria-pressed={active}
    >
      {status === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin text-brand" /> : status === 'playing' ? <Square className="h-4 w-4 text-brand" /> : <Volume2 className={`h-4 w-4 ${status === 'error' ? 'text-danger' : ''}`} />}
    </button>
  );
}
