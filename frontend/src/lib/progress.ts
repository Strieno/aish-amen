// Gamification / smart experience — shared types.

export interface Achievement {
  key: string;
  title: string;
  desc: string;
  secret: boolean;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string | null;
}

export interface Challenge {
  key: string;
  title: string;
  desc: string;
  target: number;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export interface ProgressSnapshot {
  xp: number;
  level: number;
  xpToday: number;
  xpToNext: number;
  levelProgress: number;
  streaks: { activity: number; tasks: number; focus: number; study: number; journal: number };
  achievements: Achievement[];
  challenges: Challenge[];
  newlyUnlocked: { key: string; title: string; desc: string; secret: boolean; icon: string }[];
}

export interface NextAction {
  key: string;
  type: string;
  title: string;
  reason: string;
  route: string;
  icon: string;
}

export interface Discovery {
  key: string;
  title: string;
  text: string;
  icon: string;
}

export interface Surprise {
  type: string;
  title: string;
  text: string;
  action?: { route: string } | null;
  actionLabel?: string | null;
}
