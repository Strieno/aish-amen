import { create } from 'zustand';
import { api } from '../../lib/api';
import type { ProgressSnapshot } from '../../lib/progress';

interface ProgressState {
  snapshot: ProgressSnapshot | null;
  loading: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  refresh: () => Promise<ProgressSnapshot | null>;
}

let lastLevel = 0;
const lastUnlocked = new Set<string>();

export const useProgressStore = create<ProgressState>((set) => ({
  snapshot: null,
  loading: false,
  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),
  refresh: async () => {
    try {
      const snapshot = await api.get<ProgressSnapshot>('/progress');
      set({ snapshot, loading: false });
      return snapshot;
    } catch {
      set({ loading: false });
      return null;
    }
  },
}));

/** Seed the celebration tracker from an initial snapshot (no celebrations). */
export function seedProgressTracking(snapshot: ProgressSnapshot | null) {
  if (!snapshot) return;
  lastLevel = snapshot.level;
  lastUnlocked.clear();
  for (const a of snapshot.achievements) {
    if (a.unlocked) lastUnlocked.add(a.key);
  }
}

/** Compare two snapshots; fire celebration callbacks for unlocks/level-ups. */
export function diffProgress(before: ProgressSnapshot | null, after: ProgressSnapshot, onEvent: (event: { kind: 'achievement' | 'levelup' | 'challenge'; payload: unknown }) => void) {
  if (!after) return;

  if (after.level > lastLevel) {
    lastLevel = after.level;
    onEvent({ kind: 'levelup', payload: { level: after.level } });
  }

  for (const a of after.achievements) {
    if (a.unlocked && !lastUnlocked.has(a.key)) {
      lastUnlocked.add(a.key);
      onEvent({ kind: 'achievement', payload: a });
    }
  }

  if (before) {
    const newlyDone = after.challenges.filter((c) => c.done && !before.challenges.find((b) => b.key === c.key)?.done);
    if (newlyDone.length) onEvent({ kind: 'challenge', payload: newlyDone[0] });
  }
}

export function initProgressTracking() {
  lastLevel = 0;
  lastUnlocked.clear();
}
