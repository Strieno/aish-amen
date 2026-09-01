import { useEffect, useRef, useState } from 'react';
import { Play, Square, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { usePlayer } from '../lib/audio-player';
import type { AudioFile, FocusSession, Task } from '../lib/types';
import { PageHeader, Badge, Button, Card, EmptyState, Select } from '../components/ui';
import { celebrate, PageBackdrop } from '../components/visualizations';

const PRESETS = [
  { label: '25 / 5', focus: 25, break: 5 },
  { label: '50 / 10', focus: 50, break: 10 },
  { label: '90 / 20', focus: 90, break: 20 },
];

export default function FocusPage() {
  const t = useT();
  const { data: sessions, refetch } = useApi<FocusSession[]>('/focus/sessions?limit=20');
  const { data: tasks } = useApi<Task[]>('/tasks');
  const { data: audioFiles } = useApi<AudioFile[]>('/audio/files');
  const player = usePlayer();

  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState('');
  const [ambientId, setAmbientId] = useState('');
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  // The server is the source of truth for an active session, so leaving the
  // page or refreshing no longer loses the timer.
  useEffect(() => {
    if (!sessions || restoredRef.current) return;
    restoredRef.current = true;
    const active = sessions.find((session) => !session.completed && !session.ended_at);
    if (!active) return;

    const totalSeconds = active.minutes * 60;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(active.started_at)) / 1000));
    const secondsLeft = totalSeconds - elapsedSeconds;
    if (secondsLeft > 0) {
      setMinutes(active.minutes);
      setRemaining(secondsLeft);
      setSessionId(active.id);
      setTaskId(active.task_id || '');
      setRunning(true);
      setFinished(false);
      return;
    }

    // A recently elapsed timer is considered complete; very old abandoned
    // sessions are discarded instead of inflating focus statistics.
    const endpoint = elapsedSeconds <= totalSeconds + 300
      ? api.post(`/focus/${active.id}/complete`)
      : api.del(`/focus/${active.id}`);
    endpoint.finally(refetch);
  }, [sessions, refetch]);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            finish();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = async () => {
    if (ambientId) {
      const f = audioFiles?.find((x) => x.id === ambientId);
      if (f) player.play({ id: 'focus-ambient', url: f.url, title: f.title, volume: f.volume, loop: true });
    }
    const s = await api.post<FocusSession>('/focus/start', { minutes, task_id: taskId || null });
    setSessionId(s.id);
    setRemaining(minutes * 60);
    setRunning(true);
    setFinished(false);
  };

  const finish = async () => {
    setRunning(false);
    setFinished(true);
    if (sessionId) await api.post(`/focus/${sessionId}/complete`);
    setSessionId(null);
    player.stop('focus-ambient');
    refetch();
    celebrate({ text: t('focus.completed') });
  };

  const cancel = async () => {
    setRunning(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    player.stop('focus-ambient');
    if (sessionId) await api.del(`/focus/${sessionId}`);
    setSessionId(null);
    setRemaining(minutes * 60);
    setFinished(false);
    refetch();
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const progress = ((minutes * 60 - remaining) / (minutes * 60)) * 100;

  const activeSoundIds = new Set(Object.keys(player.active));

  return (
    <div className="relative isolate mx-auto max-w-2xl space-y-4">
      <PageBackdrop variant="rings" />
      <PageHeader title={t('focus.title')} />

      <Card className="text-center">
        <div className="relative mx-auto mb-4 h-40 w-40 ring-glow">
          <div className="absolute inset-0 rounded-full border-8 border-line" />
          <div
            className="absolute inset-0 rounded-full border-8 border-brand-accent transition-all duration-1000"
            style={{ borderTopColor: 'transparent', transform: `rotate(${progress * 3.6}deg)` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-5xl font-black tabular-nums ${running ? 'text-ink' : 'text-ink-faint'}`} dir="ltr">
              {mm}:{ss}
            </span>
          </div>
        </div>

        <div className="mb-4 flex justify-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              variant={minutes === p.focus ? 'primary' : 'ghost'}
              onClick={() => { setMinutes(p.focus); setRemaining(p.focus * 60); setFinished(false); }}
              disabled={running}
              className="!px-3 !py-1.5 text-xs"
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="mx-auto mb-4 grid max-w-md gap-3 text-start sm:grid-cols-2">
          <div>
            <label className="label">{t('focus.task')}</label>
            <Select value={taskId} onChange={setTaskId} disabled={running}>
              <option value="">{t('common.none')}</option>
              {(tasks || []).filter((x) => x.status !== 'done').map((x) => (
                <option key={x.id} value={x.id}>{x.title}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label">{t('focus.ambient')}</label>
            <Select value={ambientId} onChange={setAmbientId} disabled={running}>
              <option value="">{t('common.none')}</option>
              {(audioFiles || []).map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </Select>
            {activeSoundIds.has('focus-ambient') && <Badge tone="ok">{t('audio.playing')}</Badge>}
          </div>
        </div>

        {running ? (
          <Button variant="danger" onClick={cancel}>
            <Square className="h-4 w-4" /> {t('chat.stop')}
          </Button>
        ) : (
          <Button onClick={start} disabled={finished && remaining === 0}>
            <Play className="h-4 w-4" /> {t('focus.start')}
          </Button>
        )}
        {finished && <p className="mt-3 text-sm font-semibold text-ok">✓ {t('focus.completed')}</p>}
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-bold text-ink">{t('focus.sessions')}</h2>
        {(sessions || []).length === 0 ? (
          <EmptyState text={t('common.noData')} />
        ) : (
          <Card className="!p-3">
            <ul className="divide-y divide-line">
              {(sessions || []).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-2 py-2.5">
                  <Timer className="h-4 w-4 text-brand-dark" />
                  <span className="text-sm font-semibold text-ink">{s.minutes}{t('focus.minutes')}</span>
                  <span className="text-xs text-ink-faint">{s.task_title || '—'}</span>
                  <span className="ms-auto text-xs text-ink-faint">{s.started_at.slice(0, 16).replace('T', ' ')}</span>
                  {s.completed && <Badge tone="ok">{t('focus.completed')}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
