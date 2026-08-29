/**
 * Study Engine — deterministic learning science on top of the Aish Aman DB.
 *
 * Owns: mastery computation, spaced repetition (SM-2), recommendations,
 * today's plan, exam readiness, analytics, mistakes, momentum and the study
 * context bundle sent to the AI tutor. All calculations use real data.
 */

import { all, get, run } from '../db/index.js';
import { uid, nowIso } from '../lib/util.js';

const DAY = 86400000;
export const DIFFICULTY_LEVELS = ['foundation', 'easy', 'medium', 'hard', 'exam'];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days) {
  return new Date(Date.now() - days * DAY).toISOString();
}
function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}

/* ---------------- Mastery ---------------- */

/** Recompute a topic's mastery (0-100) from real evidence. */
export function computeTopicMastery(topicId) {
  const topic = get('SELECT * FROM course_topics WHERE id = ?', topicId);
  if (!topic) return 0;

  const attempts = all(
    'SELECT correct, confidence FROM quiz_attempts WHERE topic_id = ? AND created_at >= ?',
    topicId,
    daysAgoIso(45),
  );
  const recentCorrect = attempts.filter((a) => a.correct === 1).length;
  const accuracy = attempts.length ? recentCorrect / attempts.length : null;

  const mistakes = get('SELECT COUNT(*) AS n FROM mistakes WHERE topic_id = ? AND resolved = 0', topicId)?.n || 0;
  const sessions = get('SELECT COALESCE(SUM(minutes),0) AS m FROM study_sessions WHERE topic_id = ?', topicId)?.m || 0;

  const lastReview = topic.last_reviewed;
  const reviewDays = lastReview ? (Date.now() - new Date(lastReview).getTime()) / DAY : null;
  const reviewFreshness = reviewDays == null ? 0.2 : reviewDays <= 1 ? 1 : reviewDays <= 3 ? 0.7 : reviewDays <= 7 ? 0.4 : 0.15;

  const studied = sessions > 0 ? 0.5 : topic.done ? 0.4 : 0;
  const confidenceAvg = attempts.length
    ? attempts.reduce((s, a) => s + Number(a.confidence || 0), 0) / attempts.length / 5
    : 0;

  let score;
  if (accuracy == null) {
    score = studied + reviewFreshness * 0.1;
  } else {
    score = accuracy * 0.5 + reviewFreshness * 0.2 + confidenceAvg * 0.15 + studied * 0.15;
  }
  score -= mistakes * 0.06;
  return clamp(Math.round(score * 100));
}

/** Persist a topic's mastery and bump the review counters. */
export function refreshTopicMastery(topicId, { review = false } = {}) {
  const mastery = computeTopicMastery(topicId);
  run(
    'UPDATE course_topics SET mastery=?, last_reviewed=?, review_count=review_count+? WHERE id=?',
    mastery,
    review ? nowIso() : null,
    review ? 1 : 0,
    topicId,
  );
  return mastery;
}

/** Course mastery = mean of its topics' mastery (empty → 0). */
export function courseMastery(courseId) {
  const rows = all('SELECT mastery FROM course_topics WHERE course_id = ?', courseId);
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + Number(r.mastery || 0), 0) / rows.length);
}

export function topicMasteryState(mastery) {
  if (mastery >= 85) return 'mastered';
  if (mastery >= 65) return 'good';
  if (mastery >= 45) return 'medium';
  if (mastery > 0) return 'weak';
  return 'untouched';
}

/* ---------------- Study time ---------------- */

export function studyMinutesBetween(fromIso, toIso) {
  const s = get('SELECT COALESCE(SUM(minutes),0) AS m FROM study_sessions WHERE started_at >= ? AND started_at < ?', fromIso, toIso)?.m || 0;
  const f = get('SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed = 1 AND started_at >= ? AND started_at < ?', fromIso, toIso)?.m || 0;
  return s + f;
}

/** Last N days of study minutes (for charts/heatmap). */
export function weeklySeries(days = 7) {
  const out = [];
  const dayStart = (d) => `${d.toISOString().slice(0, 10)}T00:00:00`;
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY);
    const from = dayStart(d);
    const to = new Date(d.getTime() + DAY).toISOString();
    out.push({
      date: d.toISOString().slice(0, 10),
      minutes: studyMinutesBetween(from, to),
    });
  }
  return out;
}

export function subjectDistribution(days = 30) {
  const from = daysAgoIso(days);
  const rows = all(
    `SELECT COALESCE(s.course_id, '') AS course_id, c.name AS course_name, COALESCE(SUM(s.minutes),0) AS minutes
     FROM study_sessions s LEFT JOIN courses c ON c.id = s.course_id
     WHERE s.started_at >= ? GROUP BY s.course_id ORDER BY minutes DESC`,
    from,
  );
  return rows.map((r) => ({ courseId: r.course_id, courseName: r.course_name || 'بدون مادة', minutes: Math.round(r.minutes) }));
}

export function heatmap(days = 35) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY);
    const from = `${d.toISOString().slice(0, 10)}T00:00:00`;
    const to = new Date(d.getTime() + DAY).toISOString();
    const rows = all(
      `SELECT COALESCE(s.course_id,'') AS course_id, c.name AS course_name, COALESCE(SUM(s.minutes),0) AS minutes
       FROM study_sessions s LEFT JOIN courses c ON c.id = s.course_id
       WHERE s.started_at >= ? AND s.started_at < ? GROUP BY s.course_id`,
      from,
      to,
    );
    out.push({ date: d.toISOString().slice(0, 10), total: rows.reduce((s, r) => s + r.minutes, 0), courses: rows.map((r) => ({ course: r.course_name || 'بدون مادة', minutes: Math.round(r.minutes) })) });
  }
  return out;
}

export function studyStreak() {
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(Date.now() - i * DAY);
    const from = `${d.toISOString().slice(0, 10)}T00:00:00`;
    const to = new Date(d.getTime() + DAY).toISOString();
    if (studyMinutesBetween(from, to) >= 5) streak += 1;
    else break;
  }
  return streak;
}

export function accuracyTrend(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY);
    const from = d.toISOString().slice(0, 10);
    const to = new Date(d.getTime() + DAY).toISOString().slice(0, 10);
    const rows = all('SELECT correct FROM quiz_attempts WHERE created_at >= ? AND created_at < ?', from, to);
    out.push({
      date: from,
      accuracy: rows.length ? Math.round((rows.filter((r) => r.correct === 1).length / rows.length) * 100) : null,
      attempts: rows.length,
    });
  }
  return out;
}

export function masteryTrend(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    const rows = all('SELECT mastery FROM course_topics WHERE last_reviewed >= ? AND last_reviewed < ?', d, new Date(new Date(d).getTime() + DAY).toISOString());
    out.push({ date: d, avg: rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.mastery || 0), 0) / rows.length) : null, topics: rows.length });
  }
  return out;
}

/* ---------------- Mistakes ---------------- */

export function recordMistake({ courseId, topicId, category, question, userAnswer, correctAnswer }) {
  const normalized = String(question || '').trim().slice(0, 300);
  const existing = get('SELECT * FROM mistakes WHERE question = ? AND resolved = 0 ORDER BY last_seen DESC LIMIT 1', normalized);
  if (existing) {
    run('UPDATE mistakes SET times = times + 1, last_seen = ?, user_answer = ?, correct_answer = ? WHERE id = ?', nowIso(), String(userAnswer || '').slice(0, 200), String(correctAnswer || '').slice(0, 200), existing.id);
    return existing.id;
  }
  const id = uid('mist-');
  run(
    'INSERT INTO mistakes(id, course_id, topic_id, category, question, user_answer, correct_answer, times) VALUES (?,?,?,?,?,?,?,1)',
    id,
    courseId || null,
    topicId || null,
    category || 'concept',
    normalized,
    String(userAnswer || '').slice(0, 200),
    String(correctAnswer || '').slice(0, 200),
  );
  return id;
}

export function mistakeSummary(limit = 10) {
  const rows = all('SELECT * FROM mistakes WHERE resolved = 0 ORDER BY times DESC, last_seen DESC LIMIT ?', limit);
  const byCategory = all('SELECT category, COUNT(*) AS n, SUM(times) AS total FROM mistakes WHERE resolved = 0 GROUP BY category ORDER BY total DESC');
  return { rows, byCategory };
}

export function mistakeAnalysisText() {
  const { byCategory } = mistakeSummary(50);
  const top = byCategory[0];
  if (!top) return null;
  return `أكثر فئة أخطاء مؤخرًا: ${top.category} (${top.total} مرة).`;
}

/* ---------------- Flashcards + SM-2 ---------------- */

export function dueFlashcards(courseId, limit = 40) {
  const todayStr = today();
  const params = [todayStr, limit];
  let courseClause = '';
  if (courseId) {
    courseClause = 'AND course_id = ?';
    params.unshift(courseId);
  }
  return all(
    `SELECT * FROM flashcards WHERE due_date IS NULL OR due_date <= ? ${courseClause} ORDER BY due_date IS NULL DESC, due_date ASC LIMIT ?`,
    ...params,
  );
}

export function allFlashcards({ courseId, topicId } = {}, limit = 500) {
  const where = [];
  const params = [];
  if (courseId) {
    where.push('course_id = ?');
    params.push(courseId);
  }
  if (topicId) {
    where.push('topic_id = ?');
    params.push(topicId);
  }
  params.push(limit);
  return all(`SELECT * FROM flashcards ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, ...params);
}

const SM2_QUALITY = { again: 0, hard: 1, good: 2, easy: 3 };

export function reviewFlashcard(id, grade) {
  const q = SM2_QUALITY[grade] ?? 2;
  const card = get('SELECT * FROM flashcards WHERE id = ?', id);
  if (!card) return null;
  let ease = Number(card.ease || 2.5);
  let reps = Number(card.reps || 0);
  let interval = Number(card.interval_days || 0);
  let lapses = Number(card.lapses || 0);

  if (q >= 2) {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease);
  } else {
    reps = 0;
    interval = 1;
    lapses += 1;
  }
  ease = Math.max(1.3, Math.min(3.4, ease + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02))));

  const due = new Date(Date.now() + interval * DAY).toISOString().slice(0, 10);
  run(
    'UPDATE flashcards SET ease=?, interval_days=?, reps=?, lapses=?, due_date=?, last_reviewed=? WHERE id=?',
    ease,
    interval,
    reps,
    lapses,
    due,
    nowIso(),
    id,
  );
  return { ...card, ease, interval_days: interval, reps, lapses, due_date: due, last_reviewed: nowIso() };
}

/* ---------------- Recommendations ---------------- */

/**
 * Rank topics by urgency & impact. Returns explainable recommendations.
 */
export function recommendNow({ limit = 6 } = {}) {
  const topics = all(
    `SELECT t.*, c.name AS course_name, c.id AS course_id
     FROM course_topics t JOIN courses c ON c.id = t.course_id`,
  );
  const exams = all('SELECT * FROM exams WHERE exam_date >= date(\'now\') ORDER BY exam_date ASC');

  const scored = topics.map((topic) => {
    const mastery = Number(topic.mastery || computeTopicMastery(topic.id));
    let score = 0;
    const reasons = [];

    // Exam proximity for the topic's course.
    const courseExams = exams.filter((e) => e.course_id === topic.course_id);
    const nearest = courseExams[0];
    if (nearest) {
      const days = Math.max(0, (new Date(nearest.exam_date).getTime() - Date.now()) / DAY);
      if (days <= 3) {
        score += 3;
        reasons.push(`الاختبار بعد ${Math.round(days)} يوم`);
      } else if (days <= 7) {
        score += 2;
        reasons.push(`اختبار قريب (${Math.round(days)} يوم)`);
      } else {
        score += 0.8;
        reasons.push(`اختبار ${nearest.title}`);
      }
    }

    // Low mastery = high need.
    if (mastery < 35) {
      score += 2;
      reasons.push(`الإتقان منخفض (${mastery}%)`);
    } else if (mastery < 60) {
      score += 1.2;
      reasons.push(`الإتقان متوسط (${mastery}%)`);
    }

    // Overdue reviews.
    const reviewDays = topic.last_reviewed ? (Date.now() - new Date(topic.last_reviewed).getTime()) / DAY : null;
    if (reviewDays != null && reviewDays > 4) {
      score += 1;
      reasons.push(`آخر مراجعة قبل ${Math.round(reviewDays)} يوم`);
    }

    // Recent mistakes on this topic.
    const mistakes = get('SELECT COUNT(*) AS n FROM mistakes WHERE topic_id = ? AND resolved = 0', topic.id)?.n || 0;
    if (mistakes > 0) {
      score += Math.min(1.5, mistakes * 0.4);
      reasons.push(`${mistakes} أخطاء حديثة`);
    }

    // Neglect: never reviewed but has been studied.
    if (!topic.last_reviewed && (Number(topic.review_count) > 0 || topic.done)) {
      score += 0.6;
      reasons.push('لم تُراجع بعد');
    }

    return {
      topicId: topic.id,
      title: topic.title,
      courseId: topic.course_id,
      courseName: topic.course_name,
      mastery,
      state: topicMasteryState(mastery),
      score,
      reasons: reasons.slice(0, 3),
    };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Deterministic today plan built from recommendations. */
export function todayPlan() {
  const recommendations = recommendNow({ limit: 5 });
  const items = recommendations.map((rec, i) => ({
    courseId: rec.courseId,
    courseName: rec.courseName,
    topicId: rec.topicId,
    title: rec.title,
    minutes: i === 0 ? 30 : i === 1 ? 20 : 15,
    priority: i === 0 ? 'high' : i <= 2 ? 'medium' : 'low',
    reason: rec.reasons.join(' + '),
  }));
  return { items, totalMinutes: items.reduce((s, i) => s + i.minutes, 0) };
}

/* ---------------- Exam readiness ---------------- */

export function examReadiness(exam) {
  if (!exam || !exam.exam_date) return { ready: 0, daysLeft: null, strong: [], weak: [], recommendedMinutes: null };
  const daysLeft = Math.max(0, (new Date(exam.exam_date).getTime() - Date.now()) / DAY);
  const topics = all('SELECT t.* FROM course_topics t WHERE t.course_id = ?', exam.course_id);
  const mastery = courseMastery(exam.course_id);
  const strong = topics.filter((t) => Number(t.mastery || 0) >= 65).map((t) => t.title).slice(0, 3);
  const weak = topics.filter((t) => Number(t.mastery || 0) < 45).map((t) => t.title).slice(0, 4);
  // Time-based readiness + mastery-based readiness.
  const timeReady = daysLeft >= 7 ? 1 : daysLeft >= 3 ? 0.75 : daysLeft >= 1 ? 0.5 : 0.25;
  const ready = clamp(Math.round((mastery / 100) * 0.6 + timeReady * 0.4) * 100);
  const recommendedMinutes = weak.length ? Math.round(weak.length * 45) : Math.max(0, Math.round((100 - mastery) / 20) * 20);
  return { ready, daysLeft: Math.round(daysLeft), strong, weak, recommendedMinutes };
}

/* ---------------- Momentum ---------------- */

export function academicMomentum() {
  const week = weeklySeries(7);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const prev = weeklySeries(14).slice(0, 7).reduce((s, d) => s + d.minutes, 0);
  const streak = studyStreak();
  const openAcademic = get("SELECT COUNT(*) AS n FROM tasks WHERE course_id IS NOT NULL AND status NOT IN ('done','cancelled')")?.n || 0;
  const doneAcademic7 = get("SELECT COUNT(*) AS n FROM tasks WHERE course_id IS NOT NULL AND status = 'done' AND completed_at >= ?", daysAgoIso(7))?.n || 0;

  let level = 'متزن';
  let trend = 'stable';
  if (weekMinutes >= 300 && streak >= 3) {
    level = 'قوي';
    trend = 'up';
  } else if (weekMinutes >= 120 || streak >= 2) {
    level = 'جيد';
    trend = weekMinutes > prev * 1.1 ? 'up' : 'stable';
  } else if (weekMinutes < 45 && prev >= 90) {
    level = 'بحاجة عودة';
    trend = 'down';
  }

  return {
    level,
    trend,
    weekMinutes,
    previousWeekMinutes: prev,
    streak,
    openAcademic,
    doneAcademic7,
    explanation: `درست ${weekMinutes} دقيقة هذا الأسبوع${streak ? `، ${streak} أيام متتالية` : ''}${doneAcademic7 ? `، وأنجزت ${doneAcademic7} مهام أكاديمية` : ''}.`,
  };
}

/* ---------------- Study context for AI ---------------- */

export function buildStudyContext({ courseId, topicId, question = '' } = {}) {
  const lines = [];
  if (courseId) {
    const course = get('SELECT * FROM courses WHERE id = ?', courseId);
    if (course) {
      lines.push(`المادة: ${course.name}${course.code ? ` (${course.code})` : ''}`);
      lines.push(`إتقان المادة: ${courseMastery(courseId)}%`);
    }
    const topics = all('SELECT id, title, mastery, last_reviewed FROM course_topics WHERE course_id = ?', courseId);
    if (topics.length) lines.push('المواضيع والإتقان: ' + topics.map((t) => `${t.title} (${Math.round(t.mastery || 0)}%)`).join('، '));
    const notes = all('SELECT title FROM study_notes WHERE course_id = ? ORDER BY updated_at DESC LIMIT 4', courseId);
    if (notes.length) lines.push('ملاحظات حديثة: ' + notes.map((n) => n.title).join('، '));
    const mistakes = all('SELECT question, times FROM mistakes WHERE course_id = ? AND resolved = 0 ORDER BY times DESC LIMIT 4', courseId);
    if (mistakes.length) lines.push('أخطاء متكررة: ' + mistakes.map((m) => `«${m.question.slice(0, 60)}» ×${m.times}`).join(' | '));
    const exams = all('SELECT title, exam_date FROM exams WHERE course_id = ? AND exam_date >= date(\'now\') ORDER BY exam_date LIMIT 2', courseId);
    if (exams.length) lines.push('اختبارات قادمة: ' + exams.map((e) => `${e.title} (${e.exam_date})`).join('، '));
  }
  if (topicId) {
    const topic = get('SELECT * FROM course_topics WHERE id = ?', topicId);
    if (topic) {
      lines.push(`الموضوع: ${topic.title} — إتقان ${Math.round(topic.mastery || 0)}%`);
      const notes = all('SELECT content FROM study_notes WHERE topic_id = ? ORDER BY updated_at DESC LIMIT 2', topicId);
      if (notes.length) lines.push('ملاحظات الموضوع: ' + notes.map((n) => String(n.content || '').slice(0, 160)).join(' | '));
    }
  }
  const plan = recommendNow({ limit: 2 });
  if (plan.length) lines.push('الأولوية المقترحة الآن: ' + plan.map((p) => `${p.title} (${p.courseName})`).join('، '));
  return lines.join('\n');
}

/* ---------------- Weekly plan generation ---------------- */

export function generateWeeklyPlan({ availableMinutes = 240 } = {}) {
  const recommendations = recommendNow({ limit: 12 });
  if (!recommendations.length) return [];
  const perDay = Math.max(20, Math.round(availableMinutes / 7));
  // Each slot is ~25 min, cap the number of slots to keep days realistic.
  const slots = Math.min(4, Math.max(1, Math.round(perDay / 25)));
  const items = [];
  const usedPerTopic = new Set();

  for (let day = 0; day < 7; day += 1) {
    const date = new Date(Date.now() + day * DAY).toISOString().slice(0, 10);
    const candidates = recommendations.filter((r) => !usedPerTopic.has(r.topicId));
    const dayPlan = candidates.slice(0, slots);
    if (!dayPlan.length) break;
    const slotMinutes = Math.min(45, Math.max(15, Math.round(perDay / Math.max(1, dayPlan.length))));
    for (const rec of dayPlan) {
      usedPerTopic.add(rec.topicId);
      items.push({
        date,
        courseId: rec.courseId,
        topicId: rec.topicId,
        minutes: slotMinutes,
        reason: rec.reasons.join(' + '),
      });
    }
  }
  return items;
}
