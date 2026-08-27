import { useEffect, useRef } from 'react';
import { liveBus } from '../../lib/live';
import { cinematicCelebrate, celebrate } from '../visualizations/CompletionBurst';
import { playSuccess } from '../../lib/sound';
import { useProgressStore, diffProgress, seedProgressTracking } from './progress-store';
import type { ProgressSnapshot } from '../../lib/progress';

/**
 * Loads the progress snapshot and refreshes it (debounced) whenever any
 * domain event fires or the window regains focus. Detects newly unlocked
 * achievements, level-ups and completed challenges → cinematic moments.
 */
export default function ProgressProvider() {
  const refresh = useProgressStore((s) => s.refresh);
  const timerRef = useRef<number | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    const scheduled = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        const snapshot = await refresh();
        if (snapshot && !seededRef.current) {
          seededRef.current = true;
          seedProgressTracking(snapshot);
        }
      }, 1200);
    };

    scheduled();
    const unsub = liveBus.subscribe(() => scheduled());
    const onFocus = () => scheduled();
    window.addEventListener('focus', onFocus);

    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  // Watch snapshot changes → celebrations.
  const snapshot = useProgressStore((s) => s.snapshot);
  const prevRef = useRef<ProgressSnapshot | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    diffProgress(prevRef.current, snapshot, (event) => {
      if (event.kind === 'achievement') {
        const a = event.payload as { title: string; desc: string; secret?: boolean; icon?: string };
        playSuccess();
        cinematicCelebrate({ title: a.secret ? 'إنجاز سري!' : a.title, subtitle: a.title, icon: a.icon || 'star' });
      } else if (event.kind === 'levelup') {
        const l = event.payload as { level: number };
        playSuccess();
        cinematicCelebrate({ title: `المستوى ${l.level}!`, subtitle: 'مستوى جديد في رحلتك', icon: 'trophy' });
      } else if (event.kind === 'challenge') {
        const c = event.payload as { title: string };
        celebrate({ text: `✓ ${c.title}` });
      }
    });
    prevRef.current = snapshot;
  }, [snapshot]);

  return null;
}
