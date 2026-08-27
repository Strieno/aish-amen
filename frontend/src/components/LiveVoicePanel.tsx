import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, PhoneOff, RefreshCw } from 'lucide-react';
import { Button, Modal, Spinner } from './ui';
import { startRealtimeVoice, type LiveVoiceController, type LiveVoiceState, type LiveVoiceTurn } from '../lib/realtime-voice';
import { useT } from '../lib/i18n';

interface Props {
  open: boolean;
  conversationId: string | null;
  assistantId: string;
  mode: string;
  voice: string;
  language: string;
  onClose: () => void;
  onTurn: (turn: LiveVoiceTurn) => void;
}

export default function LiveVoicePanel(props: Props) {
  const t = useT();
  const controllerRef = useRef<LiveVoiceController | null>(null);
  const [state, setState] = useState<LiveVoiceState>('connecting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const end = useCallback(() => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    props.onClose();
  }, [props.onClose]);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setError('');
    setState('connecting');
    void startRealtimeVoice({
      conversationId: props.conversationId,
      assistantId: props.assistantId,
      mode: props.mode,
      voice: props.voice,
      language: props.language,
      onState: (next) => { if (!cancelled) setState(next); },
      onTurn: props.onTurn,
      onError: (message) => { if (!cancelled) setError(message); },
    }).then((controller) => {
      if (cancelled) controller.stop();
      else controllerRef.current = controller;
    }).catch((cause) => {
      if (cancelled) return;
      const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'PermissionDeniedError');
      setState('error');
      setError(denied ? t('voice.micDenied') : (cause instanceof Error ? cause.message : t('voice.connectionError')));
    });
    return () => {
      cancelled = true;
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
  }, [attempt, props.assistantId, props.language, props.mode, props.onTurn, props.open, props.voice, t]);

  const muted = state === 'muted';
  const label = state === 'connecting' ? t('voice.connecting')
    : state === 'thinking' ? t('voice.thinking')
      : state === 'speaking' ? t('voice.speaking')
        : state === 'muted' ? t('voice.muted')
          : state === 'error' ? t('voice.error')
            : t('voice.listening');

  return (
    <Modal open={props.open} onClose={end} title={t('voice.title')}>
      <div className="flex flex-col items-center py-3 text-center">
        <div className={`relative mb-6 flex h-36 w-36 items-center justify-center rounded-full bg-brand-soft ${state === 'listening' || state === 'speaking' ? 'animate-pulse' : ''}`}>
          <span className="absolute inset-3 rounded-full border border-brand/30" />
          <span className="absolute inset-7 rounded-full bg-brand/15" />
          {state === 'connecting' || state === 'thinking'
            ? <Spinner className="h-10 w-10" />
            : state === 'error' ? <MicOff className="relative h-12 w-12 text-danger" />
              : <AudioLines className="relative h-14 w-14 text-brand-dark" />}
        </div>
        <p className="text-xl font-extrabold text-ink" aria-live="polite">{label}</p>
        <p className="mt-2 max-w-sm text-sm text-ink-faint">{t('voice.hint')}</p>
        {error && <p className="mt-4 w-full rounded-xl border border-danger-border bg-danger-bg p-3 text-sm text-danger" role="alert">{error}</p>}
        <p className="mt-4 text-xs text-ink-faint">{t('voice.disclosure')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {state === 'error' ? (
            <Button onClick={() => setAttempt((value) => value + 1)}><RefreshCw className="h-4 w-4" /> {t('common.retry')}</Button>
          ) : (
            <Button
              variant="ghost"
              disabled={state === 'connecting'}
              onClick={() => controllerRef.current?.setMuted(!muted)}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {muted ? t('voice.unmute') : t('voice.mute')}
            </Button>
          )}
          <Button variant="danger" onClick={end}><PhoneOff className="h-4 w-4" /> {t('voice.end')}</Button>
        </div>
      </div>
    </Modal>
  );
}
