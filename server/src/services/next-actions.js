/**
 * "ماذا بعد؟" — the top 3 useful actions right now, computed deterministically
 * from real state (tasks, study engine, check-ins, flashcards, journal...).
 * Every action carries an explainable reason.
 */

import { all, get } from '../db/index.js';
import { recommendNow, dueFlashcards } from './study-engine.js';
import { streaks } from './progress.js';
import { dateKey } from '../lib/util.js';

export function whatsNext({ limit = 3 } = {}) {
  const today = dateKey();
  const nextWeek = dateKey(7);
  const actions = [];

  // An explicitly activated safety plan is the strongest signal in the app.
  const activePlan = get(
    `SELECT sp.name FROM safe_living_sessions s
     JOIN safe_living_plans sp ON sp.id = s.plan_id
     WHERE s.status='active' ORDER BY s.activated_at DESC LIMIT 1`,
  );
  if (activePlan) {
    actions.push({ key: 'safe', type: 'safe', title: 'خطوة هادئة واحدة', reason: `خطة «${activePlan.name}» نشطة — اختر خطوتك الأصغر.`, route: '/safe', icon: 'shield' });
  }

  // 1) Today's check-in (state grounding comes first).
  const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today);
  if (!checkin) {
    actions.push({ key: 'checkin', type: 'checkin', title: 'سجّل حالتك الآن', reason: 'تسجيل حالة صغير يساعد التطبيق على اقتراح اليوم المناسب لك.', route: '/safe', icon: 'pulse' });
  }

  // 2) Pick an actually actionable task: overdue/due within a week, or high
  // priority. When energy is low, prefer a low-energy or short task.
  const lowEnergy = checkin && Number(checkin.energy) <= 2;
  const urgent = all(
    `SELECT id, title, priority, energy, est_minutes, due_date FROM tasks
     WHERE status NOT IN ('done','cancelled')
       AND ((due_date IS NOT NULL AND due_date <= ?) OR priority='high')`,
    nextWeek,
  ).sort((a, b) => {
    const rank = (task) => {
      const overdue = task.due_date && task.due_date < today ? 0 : 1;
      const energyFit = lowEnergy && task.energy === 'high' ? 1 : 0;
      const due = task.due_date || '9999-12-31';
      const priority = task.priority === 'high' ? 0 : task.priority === 'medium' ? 1 : 2;
      const short = Number(task.est_minutes || 9999);
      return [overdue, energyFit, due, priority, short];
    };
    const ar = rank(a);
    const br = rank(b);
    for (let i = 0; i < ar.length; i += 1) {
      if (ar[i] < br[i]) return -1;
      if (ar[i] > br[i]) return 1;
    }
    return String(a.title).localeCompare(String(b.title), 'ar');
  })[0];
  if (urgent) {
    const overdue = urgent.due_date < today;
    const reason = overdue
      ? 'متأخرة — خطوة صغيرة الآن أفضل.'
      : urgent.due_date
        ? `مستحقة قريبًا (${urgent.due_date}).`
        : lowEnergy && urgent.energy === 'low'
          ? 'أولوية عالية وتناسب طاقتك الحالية.'
          : 'أولوية عالية — ابدأ بأصغر خطوة واضحة.';
    actions.push({ key: 'urgent-task', type: 'task', title: urgent.title, reason, route: '/tasks', icon: 'check' });
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
  if (!activePlan && !lowEnergy && focusToday === 0 && s.focus >= 2) {
    actions.push({ key: 'focus', type: 'focus', title: 'اجلس 25 دقيقة تركيز', reason: 'سلسلة تركيزك نشطة — لا تقطعها اليوم.', route: '/focus', icon: 'timer' });
  }

  // Rank safety first when explicitly active, then grounding and real urgency.
  const priority = { safe: 0, checkin: 1, 'urgent-task': 2, focus: 3, journal: 4, study: 5, flashcards: 6 };
  return actions.sort((a, b) => (priority[a.key] ?? 9) - (priority[b.key] ?? 9)).slice(0, limit);
}
