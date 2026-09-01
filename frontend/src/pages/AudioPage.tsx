import { useRef, useState } from 'react';
import { Heart, ListMusic, Music, Pause, Play, Plus, Trash2, Upload, Volume2 } from 'lucide-react';
import { api, fileToBase64 } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { usePlayer } from '../lib/audio-player';
import type { AudioFile, SoundScene } from '../lib/types';
import { PageHeader, Button, Card, EmptyState, Field, Modal, Spinner } from '../components/ui';

export default function AudioPage() {
  const t = useT();
  const { data: files, loading, refetch } = useApi<AudioFile[]>('/audio/files');
  const { data: scenes, refetch: refetchScenes } = useApi<SoundScene[]>('/audio/scenes');
  const player = usePlayer();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [showScene, setShowScene] = useState(false);
  const [sceneName, setSceneName] = useState('');

  const activeIds = new Set(Object.keys(player.active));

  const importAudio = async (file: File) => {
    setImporting(true);
    try {
      const data = await fileToBase64(file);
      await api.post('/audio/import', { filename: file.name, title: file.name.replace(/\.[^.]+$/, ''), data, category: 'sound' });
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const togglePlay = (f: AudioFile) => {
    if (activeIds.has(f.id)) player.stop(f.id);
    else player.play({ id: f.id, url: f.url, title: f.title, volume: f.volume, loop: f.loop_enabled });
  };

  const addScene = async () => {
    if (!sceneName.trim()) return;
    const selected = (files || []).filter((f) => activeIds.has(f.id)).map((f) => ({
      fileId: f.id,
      title: f.title,
      url: f.url,
      volume: f.volume,
      loop: true,
    }));
    await api.post('/audio/scenes', { name: sceneName.trim(), tracks: selected, volume: 0.8 });
    setSceneName('');
    setShowScene(false);
    refetchScenes();
  };

  const playScene = (scene: SoundScene) => {
    player.stopAll();
    for (const track of scene.tracks) {
      if (track.fileId && track.url) {
        player.play({ id: `scene-${scene.id}-${track.fileId}`, url: track.url, title: track.title || '', volume: track.volume, loop: true });
      }
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('audio.title')}>
        <Button onClick={() => setShowScene(true)} variant="ghost">
          <Plus className="h-4 w-4" /> {t('audio.addScene')}
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />} {t('audio.import')}
        </Button>
      </PageHeader>

      {/* Scenes */}
      {(scenes || []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(scenes || []).map((scene) => (
            <button
              key={scene.id}
              onClick={() => playScene(scene)}
              className="chip cursor-pointer !px-4 !py-2 hover:bg-brand"
            >
              <Music className="h-4 w-4" /> {scene.name}
            </button>
          ))}
          {Object.keys(player.active).length > 0 && (
            <button onClick={player.stopAll} className="chip cursor-pointer !bg-danger-bg !text-danger">
              {t('common.stop') || 'إيقاف'} ✕
            </button>
          )}
        </div>
      )}

      {/* Master volume */}
      <Card>
        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 text-brand-dark" />
          <span className="text-sm font-bold text-ink">{t('audio.master')}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={player.master}
            onChange={(e) => player.setMaster(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-end text-xs text-ink-faint">{Math.round(player.master * 100)}%</span>
        </div>
      </Card>

      {/* Library */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-ink">{t('audio.library')}</h2>
        {loading ? (
          <Spinner className="mx-auto mt-6 block h-6 w-6" />
        ) : (files || []).length === 0 ? (
          <EmptyState text={t('audio.noFiles')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(files || []).map((f) => {
              const playing = activeIds.has(f.id);
              return (
                <Card key={f.id} className="!p-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => togglePlay(f)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark"
                      aria-label={`${playing ? t('chat.stop') : t('focus.start')}: ${f.title}`}
                    >
                      {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{f.title}</p>
                      <div className="flex items-center gap-2 text-xs text-ink-faint">
                        <span>{f.category}</span>
                        {f.duration ? <span>{Math.round(f.duration)}s</span> : null}
                        <button
                          onClick={async () => {
                            await api.put(`/audio/files/${f.id}`, { favorite: !f.favorite });
                            refetch();
                          }}
                          className={f.favorite ? 'text-danger' : ''}
                          aria-label={`${t('audio.favorite')}: ${f.title}`}
                        >
                          <Heart className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        player.stop(f.id);
                        await api.del(`/audio/files/${f.id}`);
                        refetch();
                      }}
                      className="btn-icon !h-8 !w-8"
                      aria-label={`${t('common.delete')}: ${f.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={playing ? player.active[f.id].volume : f.volume}
                      onChange={(e) => player.setVolume(f.id, Number(e.target.value))}
                      className="flex-1"
                      aria-label={`${t('audio.master')}: ${f.title}`}
                    />
                    <button onClick={() => player.setLoop(f.id, !(player.active[f.id]?.loop ?? f.loop_enabled))} className={`btn-icon !h-7 !w-7 ${player.active[f.id]?.loop ? '!text-brand-dark' : ''}`} aria-label={`${t('audio.loop')}: ${f.title}`}>
                      <ListMusic className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".wav,.mp3,.flac,.ogg,.m4a" className="hidden" onChange={(e) => e.target.files?.[0] && importAudio(e.target.files[0])} />

      <Modal open={showScene} onClose={() => setShowScene(false)} title={t('audio.addScene')}>
        <div className="space-y-3">
          <Field label={t('common.name')}><input className="input" value={sceneName} onChange={(e) => setSceneName(e.target.value)} /></Field>
          <p className="text-sm text-ink-faint">
            {t('audio.playing')}: {Object.keys(player.active).length} — سيُحفظ المشهد من الأصوات قيد التشغيل حاليًا.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowScene(false)}>{t('common.cancel')}</Button>
            <Button onClick={addScene} disabled={Object.keys(player.active).length === 0}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
