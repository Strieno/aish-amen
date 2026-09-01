import { all } from '../db/index.js';

/**
 * Simple, careful insights derived from stored data. Language is deliberately
 * correlational ("on days where...") and never asserts causation.
 */
export function getInsights() {
  const today = new Date().toISOString().slice(0, 10);

  const focus = all(
    'SELECT minutes, completed, started_at FROM focus_sessions WHERE completed = 1 ORDER BY started_at DESC LIMIT 30',
  );
  const avgFocus = focus.length
    ? Math.round(focus.reduce((s, f) => s + f.minutes, 0) / focus.length)
    : 0;

  const tasksDone = all(
    `SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL`,
  )[0]?.n || 0;

  const studyMinutes = all(
    `SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed = 1 AND started_at LIKE ?`,
    `${today}%`,
  )[0]?.m || 0;

  const postponed = all(
    `SELECT title, due_date FROM tasks
     WHERE status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date < ?
     ORDER BY due_date LIMIT 8`,
    today,
  );
  const overdueCount = all(
    `SELECT COUNT(*) AS n FROM tasks
     WHERE status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date < ?`,
    today,
  )[0]?.n || 0;

  // Tasks completed in the last 7 days (pairs well with overdueCount).
  const weekStart = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const weekTasksDone = all(
    `SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL AND completed_at >= ?`,
    `${weekStart}%`,
  )[0]?.n || 0;

  // Focus minutes this week vs the previous week (descriptive trend).
  const focusWeek = all(
    `SELECT CASE WHEN started_at >= ? THEN 'this' ELSE 'prev' END AS bucket,
            COALESCE(SUM(minutes),0) AS mins
     FROM focus_sessions WHERE completed = 1 AND started_at >= ?
     GROUP BY bucket`,
    `${weekStart}%`,
    `${new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10)}%`,
  );
  const focusThisWeek = focusWeek.find((f) => f.bucket === 'this')?.mins || 0;
  const focusPrevWeek = focusWeek.find((f) => f.bucket === 'prev')?.mins || 0;

  // Consecutive days with at least one completed focus session.
  const focusDays = all(
    `SELECT DISTINCT strftime('%Y-%m-%d', started_at) AS day
     FROM focus_sessions WHERE completed = 1 ORDER BY day DESC`,
  );
  const focusDaysStreak = (() => {
    const days = new Set(focusDays.map((f) => f.day));
    let streak = 0;
    for (let d = new Date(); days.has(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - 86_400_000)) {
      streak += 1;
    }
    return streak;
  })();

  // Most productive time of day by completed focus sessions.
  const byHour = all(
    `SELECT CAST(strftime('%H', started_at) AS INTEGER) AS hour, SUM(minutes) AS mins
     FROM focus_sessions WHERE completed = 1 GROUP BY hour ORDER BY mins DESC LIMIT 1`,
  );
  const productiveHour = byHour.length ? `${byHour[0].hour}:00` : null;

  // Sleep vs study correlation (purely descriptive).
  const sleepStudy = all(
    `SELECT c.sleep_hours AS sleep, COUNT(f.id) AS sessions
     FROM checkins c LEFT JOIN focus_sessions f ON strftime('%Y-%m-%d', f.started_at) = c.entry_date
     WHERE c.sleep_hours IS NOT NULL GROUP BY c.entry_date ORDER BY c.entry_date DESC LIMIT 14`,
  );

  return {
    avgFocusMinutes: avgFocus,
    tasksCompleted: tasksDone,
    studyMinutesToday: studyMinutes,
    postponedTasks: postponed,
    overdueCount,
    weekTasksDone,
    focusThisWeek,
    focusPrevWeek,
    focusDaysStreak,
    productiveHour,
    sleepStudy,
    generatedAt: new Date().toISOString(),
  };
}
