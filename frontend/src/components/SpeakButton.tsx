import { useEffect, useRef, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { useAppStore } from '../lib/app-store';
import { useT } from '../lib/i18n';

/** Read-aloud button (text to speech). Hidden when disabled in settings. */
export default function SpeakButton({ text, className = '' }: { text: string; className?: string }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const voiceLang = useAppStore((s) => s.settings.audio?.voiceLang);
  const rate = useAppStore((s) => s.settings.audio?.speechRate ?? 1);
  const ttsEnabled = useAppStore((s) => s.settings.audio?.ttsEnabled !== false);
  const [playing, setPlaying] = useState(false);
  const idRef = useRef(0);

  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  if (!ttsEnabled || !ttsSupported()) return null;

  const resolveLang = () => {
    if (voiceLang && voiceLang !== 'auto') return voiceLang;
    return lang === 'en' ? 'en-US' : 'ar-SA';
  };

  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    stopSpeaking();
    const id = ++idRef.current;
    setPlaying(true);
    speak({
      text,
      lang: resolveLang(),
      rate,
      onEnd: () => {
        if (idRef.current === id) setPlaying(false);
      },
    });
  };

  return (
    <button
      type="button"
      data-no-sound
      onClick={toggle}
      className={`btn-icon ${className}`}
      title={playing ? t('chat.stopSpeaking') : t('chat.speak')}
      aria-label={playing ? t('chat.stopSpeaking') : t('chat.speak')}
      aria-pressed={playing}
    >
      {playing ? <Square className="h-4 w-4 text-brand" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
}
