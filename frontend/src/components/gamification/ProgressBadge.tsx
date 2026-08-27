import { useProgressStore } from './progress-store';
import { useT } from '../../lib/i18n';

/** Small level/XP ring in the header. Click → full progress panel. */
export default function ProgressBadge() {
  const t = useT();
  const snapshot = useProgressStore((s) => s.snapshot);
  const setPanelOpen = useProgressStore((s) => s.setPanelOpen);
  if (!snapshot) return null;

  const r = 13;
  const c = 2 * Math.PI * r;
  const dash = (c * snapshot.levelProgress) / 100;

  return (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      className="relative flex h-9 items-center gap-2 rounded-xl border border-line bg-card px-2 transition hover:border-brand-lighter hover:bg-brand-soft"
      title={t('progress.level') + ` ${snapshot.level} — ${snapshot.xp} XP`}
      aria-label={`${t('progress.level')} ${snapshot.level}، ${snapshot.xp} نقطة`}
    >
      <svg width="26" height="26" viewBox="0 0 30 30" className="-rotate-90">
        <circle cx="15" cy="15" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="3" />
        <circle cx="15" cy="15" r={r} fill="none" stroke="rgb(var(--brand-accent))" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} className="transition-all duration-700" />
      </svg>
      <span className="flex flex-col items-start leading-none">
        <span className="text-xs font-extrabold text-ink">{snapshot.level}</span>
        <span className="text-[9px] text-ink-faint">{t('progress.xp')} {snapshot.xp}</span>
      </span>
      {snapshot.streaks.activity >= 3 && (
        <span className="absolute -end-1 -top-1 text-[10px]" aria-hidden="true">🔥</span>
      )}
    </button>
  );
}
