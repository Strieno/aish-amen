/**
 * "ماذا بعد؟" — the top 3 useful actions right now, computed deterministically
 * from real state (tasks, study engine, check-ins, flashcards, journal...).
 * Every action carries an explainable reason.
 */

import { all, get } from '../db/index.js';
import { recommendNow, dueFlashcards } from './study-engine.js';
import { streaks } from './progress.js';

const DAY = 86400000;

export function whatsNext({ limit = 3 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const actions = [];

  // 1) Today's check-in (state grounding comes first).
  const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today);
  if (!checkin) {
    actions.push({ key: 'checkin', type: 'checkin', title: 'سجّل حالتك الآن', reason: 'تسجيل حالة صغير يساعد التطبيق على اقتراح اليوم المناسب لك.', route: '/safe', icon: 'pulse' });
  }

  // 2) Urgent/overdue academic or regular tasks.
  const urgent = all(
    `SELECT id, title, priority, due_date FROM tasks
     WHERE status NOT IN ('done','cancelled') AND due_date IS NOT NULL
     ORDER BY due_date ASC LIMIT 1`,
  )[0];
  if (urgent) {
    const overdue = urgent.due_date < today;
    actions.push({ key: 'urgent-task', type: 'task', title: urgent.title, reason: overdue ? 'متأخرة — خطوة صغيرة الآن أفضل.' : `مستحقة قريبًا (${urgent.due_date}).`, route: '/tasks', icon: 'check' });
  }

  // 3) Study recommendation (exam proximity + weak mastery).
  const study = recommendNow({ limit: 1 })[0];
  if (study) {
    actions.push({ key: 'study', type: 'study', title: `راجع «${study.title}»`, reason: study.reasons.join(' • '), route: '/study', icon: 'book' });
  }

  // 4) Due flashcards.
  if (dueFlashcards(null, 99).length > 0) {
    actions.push({ key: 'flashcards', type: 'study', title: 'راجع بطاقاتك المستحقة', reason: 'بطاقات اليوم وفق جدول المراجعة المتباعدة.', route: '/study', icon: 'layers' });
  }

  // 5) Journal streak / missing entry.
  const journalToday = get('SELECT 1 FROM journal_entries WHERE entry_date = ?', today);
  const s = streaks();
  if (!journalToday && s.journal >= 2) {
    actions.push({ key: 'journal', type: 'journal', title: 'حافظ على سلسلة يومياتك', reason: `كتبت ${s.journal} أيام متتالية — سطر واحد يكفي اليوم.`, route: '/journal', icon: 'pen' });
  }

  // 6) Focus continuity.
  const focusToday = get("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed=1 AND started_at LIKE ?", `${today}%`)?.m || 0;
  if (focusToday === 0 && s.focus >= 2) {
    actions.push({ key: 'focus', type: 'focus', title: 'اجلس 25 دقيقة تركيز', reason: 'سلسلة تركيزك نشطة — لا تقطعها اليوم.', route: '/focus', icon: 'timer' });
  }

  // 7) Safe plan active → gentle step.
  const activePlan = get(`SELECT sp.name FROM safe_living_sessions s JOIN safe_living_plans sp ON sp.id = s.plan_id WHERE s.status='active' LIMIT 1`);
  if (activePlan) {
    actions.push({ key: 'safe', type: 'safe', title: 'خطوة هادئة واحدة', reason: `خطة «${activePlan.name}» نشطة — اختر خطوتك الأصغر.`, route: '/safe', icon: 'shield' });
  }

  // Rank: checkin first, then urgent, then streaks, then study extras.
  const priority = { checkin: 0, 'urgent-task': 1, focus: 2, journal: 3, study: 4, flashcards: 5, safe: 6 };
  return actions.sort((a, b) => (priority[a.key] ?? 9) - (priority[b.key] ?? 9)).slice(0, limit);
}
