import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import type { NextAction } from '../../lib/progress';

const ACTION_ICON: Record<string, string> = {
  checkin: '🫀', task: '✓', study: '📘', journal: '✍️', focus: '⏱', safe: '🛡', flashcards: '🗂',
};

/** "ماذا بعد؟" — the three most useful actions right now, with reasons. */
export default function NextActionsCard({ className = '' }: { className?: string }) {
  const [actions, setActions] = useState<NextAction[] | null>(null);

  useEffect(() => {
    api.get<{ actions: NextAction[] }>('/insights/next').then((r) => setActions(r.actions)).catch(() => setActions(null));
  }, []);

  if (!actions || actions.length === 0) return null;

  return (
    <div className={`card relative overflow-hidden p-4 ${className}`}>
      <span className="pointer-events-none absolute -end-10 -top-10 h-28 w-28 rounded-full bg-brand-soft/70 blur-2xl" aria-hidden="true" />
      <p className="relative mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <Compass className="h-4 w-4 text-brand-dark" /> ماذا بعد؟
      </p>
      <div className="relative space-y-2">
        {actions.map((action, i) => (
          <Link
            key={action.key}
            to={action.route}
            className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:border-brand-lighter hover:bg-brand-soft/50 ${
              i === 0 ? 'border-brand-lighter/70 bg-brand-soft/30' : 'border-line bg-card/60'
            }`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg" aria-hidden="true">
              {ACTION_ICON[action.type] || '✨'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{action.title}</span>
              <span className="block truncate text-[11px] text-ink-faint">{action.reason}</span>
            </span>
            {i === 0 && (
              <Sparkles className="h-4 w-4 shrink-0 text-brand-dark opacity-70 transition group-hover:animate-twinkle" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
