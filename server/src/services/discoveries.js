/**
 * Cross-domain discoveries — gentle, useful, unexpected connections between
 * study, work, goals, journal, focus and tasks. Language stays correlational
 * ("يبدو أن", "في الأيام التي") — never causal claims.
 */

import { all } from '../db/index.js';

export function discoverInsights({ limit = 4 } = {}) {
  const discoveries = [];
  const DAY = 86400000;

  // 1) Sleep vs focus (descriptive only).
  const sleepRows = all(
    `SELECT c.entry_date AS date, c.sleep_hours AS sleep, COALESCE(f.mins, 0) AS mins
     FROM checkins c
     LEFT JOIN (SELECT strftime('%Y-%m-%d', started_at) AS d, SUM(minutes) AS mins FROM focus_sessions WHERE completed=1 GROUP BY d) f
       ON f.d = c.entry_date
     WHERE c.sleep_hours IS NOT NULL
     ORDER BY c.entry_date DESC LIMIT 14`,
  );
  if (sleepRows.length >= 4) {
    const good = sleepRows.filter((r) => Number(r.sleep) >= 7);
    const less = sleepRows.filter((r) => Number(r.sleep) < 7);
    const avgGood = good.length ? good.reduce((s, r) => s + r.mins, 0) / good.length : 0;
    const avgLess = less.length ? less.reduce((s, r) => s + r.mins, 0) / less.length : 0;
    if (good.length && less.length && avgGood > avgLess * 1.2) {
      discoveries.push({
        key: 'sleep-focus',
        title: 'النوم يبدو صديق تركيزك',
        text: `في الأيام التي نمت فيها 7 ساعات أو أكثر، كانت جلسات تركيزك أطول بمتوسط ${Math.round(avgGood)} دقيقة مقابل ${Math.round(avgLess)} — ملاحظة وليست وصفة.`,
        icon: 'moon',
      });
    }
  }

  // 2) Gratitude days vs journal mood.
  const gratitudeMood = all(
    `SELECT g.entry_date AS date, j.mood AS mood FROM gratitude_entries g
     LEFT JOIN journal_entries j ON j.entry_date = g.entry_date
     WHERE j.mood IS NOT NULL ORDER BY g.entry_date DESC LIMIT 30`,
  );
  if (gratitudeMood.length >= 5) {
    const positive = gratitudeMood.filter((r) => ['good', 'great'].includes(String(r.mood))).length;
    if (positive / gratitudeMood.length >= 0.7) {
      discoveries.push({
        key: 'gratitude-mood',
        title: 'الامتنان واليوميات يلتقيان',
        text: 'في معظم الأيام التي كتبت فيها امتنانًا، كان مزاجك المسجل في اليوميات جيدًا أو أفضل. ربما تستحق هذه العادة مزيدًا من الأيام.',
        icon: 'heart',
      });
    }
  }

  // 3) Study time vs subject mastery — the neglected strong subject.
  const subjectTime = all(
    `SELECT COALESCE(s.course_id,'') AS id, c.name AS name, COALESCE(SUM(s.minutes),0) AS mins
     FROM study_sessions s JOIN courses c ON c.id = s.course_id GROUP BY s.course_id`,
  );
  const masteryRows = all(
    `SELECT course_id, AVG(mastery) AS avg FROM course_topics GROUP BY course_id`,
  );
  if (subjectTime.length >= 2) {
    const byMastery = new Map(masteryRows.map((r) => [r.course_id, Number(r.avg || 0)]));
    const strongest = [...subjectTime].sort((a, b) => (byMastery.get(b.id) || 0) - (byMastery.get(a.id) || 0))[0];
    const mostStudied = [...subjectTime].sort((a, b) => b.mins - a.mins)[0];
    if (strongest && mostStudied && strongest.id !== mostStudied.id && (byMastery.get(strongest.id) || 0) >= 60) {
      discoveries.push({
        key: 'neglected-strength',
        title: 'قوتك في مكان غير متوقع',
        text: `أكثر موادك إتقانًا هي «${strongest.name}» رغم أنك تدرس «${mostStudied.name}» أكثر. ساعة واحدة لـ«${strongest.name}» هذا الأسبوع قد ترفعك درجة كاملة.`,
        icon: 'brain',
      });
    }
  }

  // 4) Tasks done vs productive hour.
  const byHour = all(
    `SELECT strftime('%H', completed_at) AS h, COUNT(*) AS n FROM tasks WHERE status='done' AND completed_at IS NOT NULL GROUP BY h ORDER BY n DESC LIMIT 1`,
  );
  if (byHour.length && byHour[0].n >= 3) {
    discoveries.push({
      key: 'task-hour',
      title: 'ساعتك الذهبية للمهام',
      text: `أغلب مهامك المكتملة تُنجز حوالي الساعة ${byHour[0].h}:00 — جرّب حجز أهم مهمة يومية في هذه الفترة.`,
      icon: 'clock',
    });
  }

  // 5) Overdue academic pattern.
  const overdue = all(
    `SELECT COUNT(*) AS n FROM tasks WHERE course_id IS NOT NULL AND status NOT IN ('done','cancelled') AND due_date < date('now')`,
  )[0]?.n || 0;
  if (overdue >= 2) {
    discoveries.push({
      key: 'academic-overdue',
      title: 'المهام الدراسية تتراكم',
      text: `لديك ${overdue} مهام دراسية متأخرة. لا تخطط لإنجازها كلها — اختر واحدة اليوم واجعلها الصفر الجديد.`,
      icon: 'flag',
    });
  }

  return discoveries.slice(0, limit);
}
