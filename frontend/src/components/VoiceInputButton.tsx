import { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { sttSupported, startRecognition, type RecognitionController } from '../lib/speech';
import { playMicOff, playMicOn } from '../lib/sound';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';

/**
 * Microphone button with built-in speech-to-text. Commits the final
 * transcript through onFinal; live interim words show in a floating chip.
 */
export default function VoiceInputButton({
  onFinal,
  className = '',
}: {
  onFinal: (text: string) => void;
  className?: string;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const voiceLang = useAppStore((s) => s.settings.audio?.voiceLang);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<RecognitionController | null>(null);

  if (!sttSupported()) {
    return (
      <button
        type="button"
        className={`btn-icon ${className}`}
        title={t('chat.micUnavailable')}
        aria-label={t('chat.micUnavailable')}
        onClick={() => window.alert(t('chat.micUnavailable'))}
      >
        <Mic className="h-5 w-5" />
      </button>
    );
  }

  const resolveLang = () => {
    if (voiceLang && voiceLang !== 'auto') return voiceLang;
    return lang === 'en' ? 'en-US' : 'ar-SA';
  };

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    setInterim('');
    setError('');
    playMicOff();
  };

  const start = () => {
    if (recRef.current) {
      stop();
      return;
    }
    playMicOn();
    const rec = startRecognition({
      lang: resolveLang(),
      onInterim: (text) => setInterim(text),
      onFinal: (text) => onFinal(text),
      onEnd: () => {
        recRef.current = null;
        setListening(false);
        setInterim('');
        setError('');
      },
      onError: (message) => {
        setError(message === 'mic-denied' ? t('chat.micDenied') : message === 'no-speech' ? t('chat.micNoSpeech') : message);
        setListening(false);
        setInterim('');
      },
    });
    if (!rec) {
      window.alert(t('chat.micUnavailable'));
      return;
    }
    recRef.current = rec;
    setListening(true);
    setError('');
  };

  return (
    <span className="relative inline-flex">
      {listening && (
        <span className="absolute -top-10 start-1/2 z-10 max-w-64 -translate-x-1/2 truncate whitespace-nowrap rounded-pill bg-brand px-3 py-1 text-[11px] font-bold text-white shadow-button animate-fadeIn">
          {interim ? `${t('chat.listening')} «${interim.slice(0, 36)}»` : t('chat.listening')}
        </span>
      )}
      {error && !listening && (
        <span className="absolute -top-10 start-1/2 z-10 max-w-64 -translate-x-1/2 truncate whitespace-nowrap rounded-pill bg-danger px-3 py-1 text-[11px] font-bold text-white shadow-button animate-fadeIn">
          {error}
        </span>
      )}
      <button
        type="button"
        data-no-sound
        onClick={listening ? stop : start}
        className={`${listening ? 'btn-primary !p-2.5' : `btn-icon ${className}`}`}
        title={listening ? t('chat.micStop') : t('chat.mic')}
        aria-label={listening ? t('chat.micStop') : t('chat.mic')}
        aria-pressed={listening}
      >
        {listening ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-danger/40" aria-hidden="true" />
            <Square className="relative h-5 w-5" />
          </>
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>
    </span>
  );
}
