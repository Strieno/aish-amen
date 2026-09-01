import type { Task } from './types';
import { localDateKey } from './date';

/**
 * Smart Priority Engine.
 *
 * A small, explainable scoring system that ranks open tasks by what matters
 * most right now: overdue / near deadlines, stated importance (which the user
 * can override manually), in-progress momentum, and estimated effort.
 *
 * score = urgency + importance + momentum + weight
 *
 * Tiers:
 *   🔴 عاجل      score >= 70  (or overdue)
 *   🟠 مهم       score >= 40
 *   🟢 لاحقاً    score >= 15
 *   ⚪ اختياري   otherwise
 */

export type PriorityTier = 'urgent' | 'important' | 'later' | 'optional';

export interface PriorityInfo {
  score: number;
  tier: PriorityTier;
  overdueDays: number;
  daysUntilDue: number | null;
}

export const TIER_ORDER: Record<PriorityTier, number> = { urgent: 0, important: 1, later: 2, optional: 3 };

const IMPORTANCE: Record<Task['priority'], number> = { high: 40, medium: 20, low: 0 };

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${to.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function priorityInfo(task: Task, today: string = localDateKey()): PriorityInfo {
  let urgency = 0;
  let overdueDays = 0;
  let daysUntilDue: number | null = null;

  if (task.due_date) {
    const diff = daysBetween(today, task.due_date.slice(0, 10));
    daysUntilDue = diff;
    if (diff < 0) {
      overdueDays = -diff;
      urgency = 50 + Math.min(30, overdueDays * 5); // overdue dominates
    } else if (diff <= 3) {
      urgency = 35;
    } else if (diff <= 7) {
      urgency = 20;
    } else if (diff <= 14) {
      urgency = 10;
    }
  }

  const importance = IMPORTANCE[task.priority] ?? 0;
  const momentum = task.status === 'in-progress' ? 8 : 0;
  const effort = Number(task.est_minutes || 0) >= 60 ? 7 : Number(task.est_minutes || 0) >= 30 ? 5 : Number(task.est_minutes || 0) >= 15 ? 3 : 0;

  const score = urgency + importance + momentum + effort;

  let tier: PriorityTier;
  if (overdueDays > 0 || score >= 70) tier = 'urgent';
  else if (score >= 40) tier = 'important';
  else if (score >= 15) tier = 'later';
  else tier = 'optional';

  return { score, tier, overdueDays, daysUntilDue };
}

/** Open tasks first, ranked by score descending; completed tasks sink to the bottom. */
export function sortOpenTasks(tasks: Task[], today: string = localDateKey()): Task[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' || a.status === 'cancelled' ? 1 : 0;
    const bDone = b.status === 'done' || b.status === 'cancelled' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return priorityInfo(b, today).score - priorityInfo(a, today).score;
  });
}

/** Pick the single best next task to do right now (skips done/cancelled). */
export function bestNextTask(tasks: Task[], today: string = localDateKey()): Task | null {
  const open = sortOpenTasks(tasks, today).filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  return open[0] ?? null;
}
