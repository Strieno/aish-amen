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

/* ================= Adaptive day engine (v2) =================
 * Categorizes open tasks into four calm buckets:
 *   الآن (Now) / اليوم (Today) / لاحقاً (Later) / اختياري (Optional)
 * and re-ranks them with the user's energy, the time of day and
 * study pressure in mind — so the dashboard never overwhelms.
 */

export type DayTier = 'now' | 'today' | 'later' | 'optional';

export interface RankedTask {
  task: Task;
  tier: DayTier;
  score: number;
  overdueDays: number;
  daysUntilDue: number | null;
}

export interface DayContext {
  /** Check-in energy 1..5, or null when unknown. */
  energy: number | null;
  /** Current hour 0..23. */
  hour: number;
  /** Days until the nearest exam, or null when none. */
  examDays: number | null;
}

/** Short, low-effort tasks — the right pick when energy is low. */
export function isLightTask(task: Task): boolean {
  const est = Number(task.est_minutes || 0);
  return task.energy === 'low' || (est > 0 && est <= 15);
}

export function lightTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && isLightTask(t));
}

/** Rank open tasks for the day with adaptive context. */
export function rankDay(tasks: Task[], today: string = localDateKey(), ctx: DayContext = { energy: null, hour: 12, examDays: null }): RankedTask[] {
  const lateNight = ctx.hour >= 22 || ctx.hour < 5;
  const lowEnergy = ctx.energy != null && ctx.energy <= 2;
  const highEnergy = ctx.energy != null && ctx.energy >= 4;
  const examSoon = ctx.examDays != null && ctx.examDays <= 7;

  return tasks
    .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    .map((task) => {
      const info = priorityInfo(task, today);
      let score = info.score;

      // Energy awareness: easy tasks rise, heavy tasks sink (and vice-versa).
      if (lowEnergy) {
        if (task.energy === 'low' || (Number(task.est_minutes || 0) > 0 && Number(task.est_minutes) <= 15)) score += 10;
        if (task.energy === 'high' || Number(task.est_minutes || 0) >= 60) score -= 12;
      } else if (highEnergy) {
        if (task.energy === 'high') score += 6;
      }

      // Late night: heavy work waits for tomorrow.
      if (lateNight && Number(task.est_minutes || 0) >= 60) score -= 12;

      // Study pressure: course-linked tasks become urgent before an exam.
      if (examSoon && task.course_id) score += 10;

      let tier: DayTier;
      if (info.overdueDays > 0 || (score >= 75 && info.daysUntilDue !== null && info.daysUntilDue <= 2)) tier = 'now';
      else if (info.daysUntilDue === 0 || score >= 45) tier = 'today';
      else if (score >= 15 || (info.daysUntilDue !== null && info.daysUntilDue <= 7)) tier = 'later';
      else tier = 'optional';

      return { task, tier, score, overdueDays: info.overdueDays, daysUntilDue: info.daysUntilDue };
    })
    .sort((a, b) => b.score - a.score);
}

/** Group ranked tasks into their day buckets. */
export function groupDayTasks(ranked: RankedTask[]): Record<DayTier, RankedTask[]> {
  const out: Record<DayTier, RankedTask[]> = { now: [], today: [], later: [], optional: [] };
  for (const r of ranked) out[r.tier].push(r);
  return out;
}

export const DAY_TIER_ORDER: DayTier[] = ['now', 'today', 'later', 'optional'];

/** Compact per-tier row limits so lists stay short and calm. */
export const DAY_TIER_LIMIT: Record<DayTier, number> = { now: 3, today: 3, later: 2, optional: 0 };
