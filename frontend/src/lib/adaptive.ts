import type { TodayData } from './types';
import { localDateKey } from './date';

/**
 * Adaptive interface — reads the user's actual state (check-in energy, time
 * of day, upcoming exams, workload) and tells the dashboard how to behave:
 * fewer tasks when tired, calmer screens at night, highlighted deadlines
 * before exams, and so on. No medical claims — just a gentle UI response.
 */

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

export interface AdaptiveState {
  /** Check-in energy 1..5, or null. */
  energy: number | null;
  stress: number | null;
  lowEnergy: boolean;
  dayPhase: DayPhase;
  lateNight: boolean;
  /** Days until the nearest exam (0 = today), null when none. */
  examDays: number | null;
  examSoon: boolean;
  examTitle: string | null;
  /** Safe-living load estimate. */
  load: 'stable' | 'slightly-overloaded' | 'overloaded';
  openCount: number;
  doneToday: number;
}

export function computeAdaptive(data: TodayData | null, now = new Date()): AdaptiveState {
  const hour = now.getHours();
  const energy = data?.checkin?.energy ?? null;
  const stress = data?.checkin?.stress ?? null;
  const exams = data?.intelligence?.study?.exams ?? [];
  const today = localDateKey();

  let examDays: number | null = null;
  let examTitle: string | null = null;
  if (exams.length > 0) {
    const soonest = exams
      .map((e) => ({ ...e, diff: daysBetween(today, e.exam_date) }))
      .filter((e) => Number.isFinite(e.diff))
      .sort((a, b) => a.diff - b.diff)[0];
    if (soonest && soonest.diff >= 0) {
      examDays = soonest.diff;
      examTitle = soonest.title;
    }
  }

  const dayPhase: DayPhase = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'day' : hour < 22 ? 'evening' : 'night';

  return {
    energy,
    stress,
    lowEnergy: energy != null && energy <= 2,
    dayPhase,
    lateNight: hour >= 22 || hour < 5,
    examDays,
    examSoon: examDays != null && examDays <= 7,
    examTitle,
    load: data?.safe?.level ?? 'stable',
    openCount: (data?.tasks ?? []).filter((t) => t.status !== 'done' && t.status !== 'cancelled').length,
    doneToday: data?.stats.doneToday ?? 0,
  };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${to.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
