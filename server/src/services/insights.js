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
    productiveHour,
    sleepStudy,
    generatedAt: new Date().toISOString(),
  };
}
