/**
 * Progress & Smart Gamification — XP, levels, streaks, secret achievements
 * and daily challenges. Everything is computed deterministically from real
 * activity (activity_events + study tables), never from demo data.
 */

import { all, get, run } from '../db/index.js';
import { nowIso } from '../lib/util.js';

const DAY = 86400000;

export function computeXp() {
  const xpFromEvents = all(
    `SELECT COALESCE(SUM(
       CASE event_type
         WHEN 'TaskCreated' THEN 5 WHEN 'TaskCompleted' THEN 12
         WHEN 'JournalEntryCreated' THEN 12 WHEN 'CheckInCreated' THEN 10
         WHEN 'FocusSessionCompleted' THEN 15 WHEN 'ExamGradeRecorded' THEN 25
         WHEN 'ExamCreated' THEN 5 WHEN 'GoalProgressChanged' THEN 10
         WHEN 'MilestoneCompleted' THEN 20 WHEN 'WorkNoteCreated' THEN 8
         WHEN 'SafePlanActivated' THEN 15 WHEN 'CourseCreated' THEN 6
         WHEN 'MemoryCreated' THEN 5 WHEN 'LinkCreated' THEN 3
         WHEN 'ConversationMessageCreated' THEN 2 ELSE 0 END
     ),0) AS xp FROM activity_events`,
  )[0]?.xp || 0;

  const study = all('SELECT COALESCE(SUM(minutes),0) AS m, COUNT(*) AS n FROM study_sessions')[0];
  const quiz = all('SELECT COUNT(*) AS n FROM quiz_attempts WHERE correct = 1')[0]?.n || 0;
  const reviews = all('SELECT COUNT(*) AS n FROM flashcards WHERE last_reviewed IS NOT NULL')[0]?.n || 0;

  return xpFromEvents + (study?.n || 0) * 10 + Math.floor((study?.m || 0) / 10) + quiz * 5 + reviews * 2;
}

export function xpToday() {
  const timestamp = new Date().toISOString().slice(0, 10);
  const xpFromEvents = all(
    `SELECT COALESCE(SUM(
       CASE event_type
         WHEN 'TaskCreated' THEN 5 WHEN 'TaskCompleted' THEN 12
         WHEN 'JournalEntryCreated' THEN 12 WHEN 'CheckInCreated' THEN 10
         WHEN 'FocusSessionCompleted' THEN 15 WHEN 'ExamGradeRecorded' THEN 25
         WHEN 'ExamCreated' THEN 5 WHEN 'GoalProgressChanged' THEN 10
         WHEN 'MilestoneCompleted' THEN 20 WHEN 'WorkNoteCreated' THEN 8
         WHEN 'SafePlanActivated' THEN 15 WHEN 'CourseCreated' THEN 6
         WHEN 'MemoryCreated' THEN 5 WHEN 'LinkCreated' THEN 3
         WHEN 'ConversationMessageCreated' THEN 2 ELSE 0 END
     ),0) AS xp FROM activity_events WHERE ts >= ?`,
    `${timestamp}T00:00:00`,
  )[0]?.xp || 0;

  const study = all('SELECT COALESCE(SUM(minutes),0) AS m, COUNT(*) AS n FROM study_sessions WHERE started_at >= ?', `${timestamp}T00:00:00`)[0];
  const quiz = all('SELECT COUNT(*) AS n FROM quiz_attempts WHERE correct = 1 AND created_at >= ?', timestamp)[0]?.n || 0;
  const reviews = all('SELECT COUNT(*) AS n FROM flashcards WHERE last_reviewed >= ?', timestamp)[0]?.n || 0;

  return xpFromEvents + (study?.n || 0) * 10 + Math.floor((study?.m || 0) / 10) + quiz * 5 + reviews * 2;
}

/* ---------------- Levels ---------------- */

export function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function xpForLevel(level) {
  return Math.pow(level - 1, 2) * 100;
}

/* ---------------- Streaks ---------------- */

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

function streakOfDays(dates) {
  const set = new Set(dates.map(dayKey));
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    if (set.has(d)) streak += 1;
    else break;
  }
  return streak;
}

export function streaks() {
  const activityDays = all('SELECT DISTINCT strftime(\'%Y-%m-%d\', ts) AS d FROM activity_events').map((r) => r.d);
  const taskDays = all("SELECT DISTINCT strftime('%Y-%m-%d', completed_at) AS d FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL").map((r) => r.d);
  const focusDays = all("SELECT DISTINCT strftime('%Y-%m-%d', started_at) AS d FROM focus_sessions WHERE completed = 1").map((r) => r.d);
  const studyDays = all("SELECT DISTINCT strftime('%Y-%m-%d', started_at) AS d FROM study_sessions").map((r) => r.d);
  const journalDays = all('SELECT DISTINCT entry_date AS d FROM journal_entries').map((r) => r.d);
  return {
    activity: streakOfDays(activityDays),
    tasks: streakOfDays(taskDays),
    focus: streakOfDays(focusDays),
    study: streakOfDays(studyDays),
    journal: streakOfDays(journalDays),
  };
}

/* ---------------- Achievements ---------------- */

const ACHIEVEMENTS = [
  { key: 'first-task', title: 'أول خطوة', desc: 'أكمل أول مهمة', secret: false, icon: 'check' },
  { key: 'task-10', title: 'عشر خطوات', desc: 'أكمل 10 مهام', secret: false, icon: 'list' },
  { key: 'task-50', title: 'خمسون إنجازًا', desc: 'أكمل 50 مهمة', secret: false, icon: 'trophy' },
  { key: 'focus-first', title: 'صفاء ذهني', desc: 'أكمل أول جلسة تركيز', secret: false, icon: 'timer' },
  { key: 'focus-10', title: 'عشر جلسات صفاء', desc: 'أكمل 10 جلسات تركيز', secret: false, icon: 'timer' },
  { key: 'streak-3', title: 'ثلاثة أيام متتالية', desc: 'نشاط لـ3 أيام متتالية', secret: false, icon: 'fire' },
  { key: 'streak-7', title: 'أسبوع كامل', desc: 'نشاط لـ7 أيام متتالية', secret: false, icon: 'fire' },
  { key: 'streak-30', title: 'شهر من الاستمرارية', desc: 'نشاط لـ30 يومًا متتاليًا', secret: false, icon: 'fire' },
  { key: 'master-topic', title: 'مُتقن', desc: 'وصل إتقان موضوع إلى 85%+', secret: false, icon: 'brain' },
  { key: 'exam-recorded', title: 'سجّلت درجة', desc: 'سجّل درجة اختبار', secret: false, icon: 'book' },
  { key: 'journal-7', title: 'سبع صفحات', desc: 'اكتب 7 إدخالات يوميات', secret: false, icon: 'pen' },
  { key: 'gratitude-5', title: 'قلب ممتن', desc: '5 إدخالات امتنان', secret: false, icon: 'heart' },
  { key: 'memory-10', title: 'أرشيف حي', desc: 'احفظ 10 ذكريات', secret: false, icon: 'archive' },
  { key: 'goal-done', title: 'حلم تحقق', desc: 'أكمل هدفًا 100%', secret: false, icon: 'flag' },
  { key: 'safe-plan', title: 'درعك الخاص', desc: 'فعّل خطة عيش آمن', secret: false, icon: 'shield' },
  { key: 'night-owl', title: 'بومة ليلية', desc: 'اكتب يومية بعد 11 مساءً', secret: true, icon: 'moon' },
  { key: 'perfectionist', title: 'عشرة في يوم', desc: 'أكمل 10 مهام في يوم واحد', secret: true, icon: 'zap' },
  { key: 'early-bird', title: 'عصفور الصباح', desc: 'جلسة تركيز قبل 7 صباحًا', secret: true, icon: 'sun' },
  { key: 'comeback', title: 'العودة', desc: 'عُد بعد أسبوع غياب وأكمل مهمة', secret: true, icon: 'refresh' },
  { key: 'curious', title: 'روح فضولية', desc: 'جرّب «فاجئني»', secret: true, icon: 'dice' },
];

function aCondition(key) {
  switch (key) {
    case 'first-task': return all("SELECT COUNT(*) AS n FROM tasks WHERE status = 'done'")[0].n >= 1;
    case 'task-10': return all("SELECT COUNT(*) AS n FROM tasks WHERE status = 'done'")[0].n >= 10;
    case 'task-50': return all("SELECT COUNT(*) AS n FROM tasks WHERE status = 'done'")[0].n >= 50;
    case 'focus-first': return all('SELECT COUNT(*) AS n FROM focus_sessions WHERE completed = 1')[0].n >= 1;
    case 'focus-10': return all('SELECT COUNT(*) AS n FROM focus_sessions WHERE completed = 1')[0].n >= 10;
    case 'streak-3': return streaks().activity >= 3;
    case 'streak-7': return streaks().activity >= 7;
    case 'streak-30': return streaks().activity >= 30;
    case 'master-topic': return all('SELECT COUNT(*) AS n FROM course_topics WHERE mastery >= 85')[0].n >= 1;
    case 'exam-recorded': return all('SELECT COUNT(*) AS n FROM exams WHERE grade IS NOT NULL')[0].n >= 1;
    case 'journal-7': return all('SELECT COUNT(*) AS n FROM journal_entries')[0].n >= 7;
    case 'gratitude-5': return all('SELECT COUNT(*) AS n FROM gratitude_entries')[0].n >= 5;
    case 'memory-10': return all('SELECT COUNT(*) AS n FROM memories WHERE archived = 0')[0].n >= 10;
    case 'goal-done': return all('SELECT COUNT(*) AS n FROM goals WHERE progress >= 1')[0].n >= 1;
    case 'safe-plan': return all("SELECT COUNT(*) AS n FROM safe_living_sessions WHERE status = 'active' OR status = 'ended'")[0].n >= 1;
    case 'night-owl': return all('SELECT COUNT(*) AS n FROM journal_entries WHERE created_at LIKE ? OR updated_at LIKE ?', '%T23%', '%T23%')[0].n >= 1;
    case 'perfectionist': return all(`SELECT COUNT(*) AS n FROM (SELECT strftime('%Y-%m-%d', completed_at) AS d, COUNT(*) AS c FROM tasks WHERE status='done' GROUP BY d HAVING c >= 10)`)[0].n >= 1;
    case 'early-bird': return all(`SELECT COUNT(*) AS n FROM focus_sessions WHERE completed = 1 AND strftime('%H', started_at) < '07'`)[0].n >= 1;
    case 'comeback': return comebackCheck();
    case 'curious': return get('SELECT 1 FROM settings WHERE key = ? AND value = ?', 'surprise_used', '1') != null;
    default: return false;
  }
}

function comebackCheck() {
  const done = all("SELECT DISTINCT strftime('%Y-%m-%d', completed_at) AS d FROM tasks WHERE status='done' ORDER BY d").map((r) => r.d);
  if (done.length < 2) return false;
  for (let i = 1; i < done.length; i += 1) {
    const gap = (new Date(done[i]).getTime() - new Date(done[i - 1]).getTime()) / DAY;
    if (gap >= 7) return true;
  }
  return false;
}

/** Evaluate the catalog, unlock new achievements, return the fresh unlocks. */
export function checkAchievements() {
  const unlocked = new Set(all('SELECT id FROM achievements').map((r) => r.id));
  const newly = [];
  for (const def of ACHIEVEMENTS) {
    if (unlocked.has(def.key)) continue;
    try {
      if (aCondition(def.key)) {
        run('INSERT OR IGNORE INTO achievements(id, unlocked_at) VALUES (?,?)', def.key, nowIso());
        newly.push(def);
      }
    } catch { /* condition failure must never crash progress */ }
  }
  return newly;
}

export function achievementCatalog({ revealSecrets = true } = {}) {
  const unlocked = new Set(all('SELECT id, unlocked_at FROM achievements').map((r) => [r.id, r.unlocked_at]));
  const map = new Map(unlocked);
  return ACHIEVEMENTS.map((def) => {
    const at = map.get(def.key);
    return {
      key: def.key,
      title: at || !def.secret || revealSecrets ? def.title : '؟؟؟',
      desc: at || !def.secret || revealSecrets ? def.desc : 'إنجاز سري — اكتشفه بنفسك',
      secret: def.secret,
      icon: def.icon,
      unlocked: !!at,
      unlockedAt: at || null,
    };
  });
}

/* ---------------- Daily challenges ---------------- */

const CHALLENGE_POOL = [
  { key: 'tasks-3', title: 'أكمل 3 مهام', desc: 'ثلاث خطوات صغيرة اليوم' },
  { key: 'focus-25', title: '25 دقيقة تركيز', desc: 'جلسة تركيز واحدة' },
  { key: 'gratitude-1', title: 'امتنان واحد', desc: 'اكتب شيئًا ممتنًا له' },
  { key: 'journal-1', title: 'يومية اليوم', desc: 'دوّن ولو سطرًا واحدًا' },
  { key: 'checkin-1', title: 'سجّل حالتك', desc: 'تسجيل حالة اليوم' },
  { key: 'flashcards-5', title: '5 بطاقات مراجعة', desc: 'راجع بطاقاتك المستحقة' },
  { key: 'study-20', title: '20 دقيقة دراسة', desc: 'جلسة دراسة قصيرة' },
];

function seedForDate(dateStr) {
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function todayChallenges() {
  const today = new Date().toISOString().slice(0, 10);
  const seed = seedForDate(today);
  const picked = [0, 1, 2].map((i) => CHALLENGE_POOL[(seed + i * 3) % CHALLENGE_POOL.length]);
  const doneRows = all('SELECT challenge_key FROM daily_challenges WHERE date = ? AND done = 1', today);
  const doneSet = new Set(doneRows.map((r) => r.challenge_key));

  const progressFor = (key) => {
    switch (key) {
      case 'tasks-3': return Math.min(3, all("SELECT COUNT(*) AS n FROM tasks WHERE status='done' AND completed_at LIKE ?", `${today}%`)[0].n);
      case 'focus-25': return Math.min(25, all("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed=1 AND started_at LIKE ?", `${today}%`)[0].m);
      case 'gratitude-1': return Math.min(1, all('SELECT COUNT(*) AS n FROM gratitude_entries WHERE entry_date = ?', today)[0].n);
      case 'journal-1': return Math.min(1, all('SELECT COUNT(*) AS n FROM journal_entries WHERE entry_date = ?', today)[0].n);
      case 'checkin-1': return Math.min(1, all('SELECT COUNT(*) AS n FROM checkins WHERE entry_date = ?', today)[0].n);
      case 'flashcards-5': return Math.min(5, all('SELECT COUNT(*) AS n FROM flashcards WHERE last_reviewed >= ?', today)[0].n);
      case 'study-20': return Math.min(20, all("SELECT COALESCE(SUM(minutes),0) AS m FROM study_sessions WHERE started_at LIKE ?", `${today}%`)[0].m);
      default: return 0;
    }
  };

  return picked.map((def) => {
    const progress = progressFor(def.key);
    const target = def.key === 'tasks-3' ? 3 : def.key === 'focus-25' ? 25 : def.key === 'flashcards-5' ? 5 : def.key === 'study-20' ? 20 : 1;
    const complete = progress >= target;
    return { ...def, target, progress, done: doneSet.has(def.key) || complete, claimed: doneSet.has(def.key) };
  });
}

export function claimChallenge(key) {
  const today = new Date().toISOString().slice(0, 10);
  const challenges = todayChallenges();
  const target = challenges.find((c) => c.key === key);
  if (!target) return { ok: false, error: 'not today' };
  if (target.progress < target.target) return { ok: false, error: 'not complete', progress: target.progress, target: target.target };
  const existing = get('SELECT 1 FROM daily_challenges WHERE date = ? AND challenge_key = ?', today, key);
  if (!existing) {
    run('INSERT INTO daily_challenges(date, challenge_key, done) VALUES (?,?,1)', today, key);
    return { ok: true, bonusXp: 20, first: true };
  }
  return { ok: true, bonusXp: 0, first: false };
}

/* ---------------- Snapshot ---------------- */

export function progressSnapshot() {
  const xp = computeXp();
  const level = levelFromXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const newly = checkAchievements();
  return {
    xp,
    level,
    xpToday: xpToday(),
    xpToNext: Math.max(0, next - xp),
    levelProgress: Math.min(100, Math.round(((xp - current) / Math.max(1, next - current)) * 100)),
    streaks: streaks(),
    achievements: achievementCatalog(),
    challenges: todayChallenges(),
    newlyUnlocked: newly,
  };
}

/** Mark the surprise feature as used (secret achievement hook). */
export function markSurpriseUsed() {
  run('INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'surprise_used', '1');
}
