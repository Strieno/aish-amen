import { useState } from 'react';
import { api } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Button } from '../ui';
import { useProgressStore } from './progress-store';
import { celebrate } from '../visualizations/CompletionBurst';
import type { Challenge } from '../../lib/progress';

const ICONS: Record<string, string> = {
  trophy: '🏆', fire: '🔥', check: '✓', list: '☑', timer: '⏱', brain: '🧠',
  book: '📘', pen: '✍️', heart: '💚', archive: '🗃', flag: '🚩', shield: '🛡',
  moon: '🌙', zap: '⚡', sun: '🌅', refresh: '🔄', dice: '🎲', star: '✨',
};

export default function ProgressPanel() {
  const t = useT();
  const open = useProgressStore((s) => s.panelOpen);
  const setPanelOpen = useProgressStore((s) => s.setPanelOpen);
  const snapshot = useProgressStore((s) => s.snapshot);
  const refresh = useProgressStore((s) => s.refresh);
  const [claiming, setClaiming] = useState<string | null>(null);

  if (!open) return null;

  const claim = async (challenge: Challenge) => {
    setClaiming(challenge.key);
    try {
      await api.post(`/progress/challenges/${challenge.key}/claim`);
      celebrate({ text: `+20 XP • ${challenge.title}` });
      refresh();
    } finally {
      setClaiming(null);
    }
  };

  const streakItems = [
    { key: 'activity', label: t('progress.activity'), value: snapshot?.streaks.activity ?? 0, icon: '🔥' },
    { key: 'tasks', label: t('progress.tasksStreak'), value: snapshot?.streaks.tasks ?? 0, icon: '✓' },
    { key: 'focus', label: t('progress.focusStreak'), value: snapshot?.streaks.focus ?? 0, icon: '⏱' },
    { key: 'study', label: t('progress.studyStreak'), value: snapshot?.streaks.study ?? 0, icon: '📘' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setPanelOpen(false)} />
      <div className="card relative z-10 max-h-[86dvh] w-full max-w-lg animate-fadeIn overflow-y-auto bg-card p-6" role="dialog" aria-modal="true" aria-label={t('progress.title')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">✨ {t('progress.title')}</h2>
          <button onClick={() => setPanelOpen(false)} className="btn-icon" aria-label={t('common.close')}>✕</button>
        </div>

        {/* Level + XP */}
        <div className="mb-4 rounded-2xl bg-brand-soft/70 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink">{t('progress.level')} <span className="text-xl font-extrabold text-brand-dark">{snapshot?.level}</span></p>
            <p className="text-xs text-ink-soft">{snapshot?.xp} XP • +{snapshot?.xpToday} {t('progress.today')}</p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-pill bg-line">
            <div className="h-full rounded-pill bg-gradient-to-r from-brand-accent to-brand transition-all duration-700" style={{ width: `${snapshot?.levelProgress ?? 0}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">{snapshot?.xpToNext} XP {t('progress.toNext')}</p>
        </div>

        {/* Streaks */}
        <div className="mb-4 grid grid-cols-4 gap-2">
          {streakItems.map((s) => (
            <div key={s.key} className="rounded-xl bg-elevated p-2 text-center">
              <span className="text-lg" aria-hidden="true">{s.icon}</span>
              <p className="text-sm font-extrabold text-ink">{s.value}</p>
              <p className="text-[10px] text-ink-faint">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Daily challenges */}
        <p className="mb-2 text-sm font-bold text-ink">{t('progress.challenges')}</p>
        <div className="mb-4 space-y-2">
          {(snapshot?.challenges || []).map((challenge) => {
            const pct = Math.min(100, Math.round((challenge.progress / Math.max(1, challenge.target)) * 100));
            return (
              <div key={challenge.key} className="rounded-xl border border-line bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{challenge.title}</p>
                    <p className="text-[11px] text-ink-faint">{challenge.desc}</p>
                  </div>
                  {challenge.done && !challenge.claimed ? (
                    <Button className="!px-3 !py-1 text-xs" onClick={() => claim(challenge)} disabled={claiming === challenge.key}>
                      {t('progress.claim')}
                    </Button>
                  ) : challenge.claimed ? (
                    <span className="chip !bg-ok-bg !text-ok">✓</span>
                  ) : null}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-line">
                  <div className="h-full rounded-pill bg-brand-accent transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-ink-faint">{challenge.progress}/{challenge.target}</p>
              </div>
            );
          })}
        </div>

        {/* Achievements */}
        <p className="mb-2 text-sm font-bold text-ink">{t('progress.achievements')}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(snapshot?.achievements || []).map((a) => (
            <div
              key={a.key}
              title={a.unlocked ? a.desc : a.secret ? t('progress.secret') : a.desc}
              className={`rounded-xl border p-2.5 text-center transition ${a.unlocked ? 'border-brand-lighter bg-brand-soft/70' : 'border-dashed border-line opacity-60'}`}
            >
              <span className="text-xl" aria-hidden="true">{a.unlocked ? ICONS[a.icon] || '✨' : '🔒'}</span>
              <p className="mt-1 text-[10px] font-bold leading-tight text-ink">{a.unlocked || !a.secret ? a.title : '؟؟؟'}</p>
              {a.secret && a.unlocked && <p className="text-[9px] text-warn">{t('progress.secret')}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
