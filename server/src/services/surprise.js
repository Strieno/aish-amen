/**
 * "فاجئني" — context-aware surprise generator.
 * Picks a useful, occasionally playful surprise from real state:
 * a small challenge, a reflection question, an insight, a fun break,
 * or an AI-flavored idea (with graceful fallback to local templates).
 */

import { all, get } from '../db/index.js';
import { oneShot } from './chat.js';
import { markSurpriseUsed } from './progress.js';
import { recommendNow } from './study-engine.js';

const REFLECTION_QUESTIONS = [
  'ما أصغر شيء أنجزته اليوم يمكن أن تفخر به؟',
  'إذا أعدت اليوم مرة واحدة، ما الذي كنت ستغيّره؟',
  'ما الذي يستهلك طاقتك اليوم دون أن تلاحظه؟',
  'متى كان آخر موقف شعرت فيه بالهدوء الحقيقي؟',
];

const MINI_CHALLENGES = [
  { title: 'دقيقتان تنفس', text: 'أغلق عينيك وتنفّس 4 ثوانٍ شهيقًا و6 ثوانٍ زفيرًا، لمدة دقيقتين فقط.' },
  { title: 'أعِد ترتيب مكتبك', text: 'رتّب ثلاثة أشياء فقط أمامك — ثلاثة تكفي لتغيير المزاج.' },
  { title: 'اكتب 5 أسطر', text: 'اكتب عن هذا اليوم كما لو كان نهاية حلقة من مسلسل هادئ.' },
];

export async function surprise() {
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getHours();

  const tasksDone = all("SELECT COUNT(*) AS n FROM tasks WHERE status='done' AND completed_at LIKE ?", `${today}%`)[0].n;
  const openTasks = all("SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('done','cancelled')")[0].n;
  const focusToday = get("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE completed=1 AND started_at LIKE ?", `${today}%`)?.m || 0;
  const study = recommendNow({ limit: 1 })[0];
  const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today);
  const journalToday = get('SELECT 1 FROM journal_entries WHERE entry_date = ?', today);

  // Pick the surprise type from real context.
  let type = 'idea';
  let title = '';
  let text = '';
  let action = null;
  let actionLabel = null;

  if (!journalToday) {
    type = 'reflection';
    title = 'سؤال تأمل';
    text = REFLECTION_QUESTIONS[Math.floor(Math.random() * REFLECTION_QUESTIONS.length)];
    action = { route: '/journal' };
    actionLabel = 'اكتب يوميتك';
  } else if (!checkin) {
    type = 'checkin';
    title = 'نبض اليوم';
    text = 'لم تسجّل حالتك اليوم بعد — 30 ثانية تعطي التطبيق إحساسًا بيومك.';
    action = { route: '/safe' };
    actionLabel = 'سجّل الآن';
  } else if (study && focusToday < 25) {
    type = 'challenge';
    title = 'تحدٍّ صغير';
    text = `اختبر نفسك في «${study.title}» — سؤال واحد فقط الآن. ${study.reasons[0] ? `لماذا؟ ${study.reasons[0]}` : ''}`;
    action = { route: '/study' };
    actionLabel = 'افتح الممارسة';
  } else if (tasksDone === 0 && openTasks > 0) {
    type = 'challenge';
    title = 'مهمة وحيدة';
    text = `لديك ${openTasks} مهمة مفتوحة. اختر الأصغر منها وأنهها الآن — ستدهشك الخفة.`;
    action = { route: '/tasks' };
    actionLabel = 'افتح المهام';
  } else if (hour >= 22) {
    type = 'calm';
    title = 'وقت الهدوء';
    text = 'المساء ليس للسباق. اترك المهام الثقيلة، واختر شيئًا يريحك قبل النوم.';
  } else {
    type = 'idea';
    const ideas = [
      'حاول أن تشرح مفهومًا واحدًا اليوم لصديق كما لو كنت المعلم — ستكتشف ثغرات فهمك فورًا.',
      'اكتب أهدافك كأنها انتهت فعلًا: «أنهيت...» بدل «سوف أنهي...» — جرّبها خمس دقائق.',
      'اختر أصعب مهامك اليوم وقسّمها لثلاث خطوات صغيرة تكتبها الآن.',
    ];
    title = 'فكرة اليوم';
    text = ideas[Math.floor(Math.random() * ideas.length)];
  }

  markSurpriseUsed();

  // Optional AI flavor — never blocks the surprise.
  try {
    const result = await oneShot({
      systemPrompt: 'أنت مولد لحظات صغيرة ممتعة داخل تطبيق حياة هادئ. أعد سطرًا عربيًا واحدًا مشجعًا (أقل من 100 حرف) يتعلق بالاقتراح التالي، بدون مبالغة.',
      userContent: `${title}: ${text}`,
      maxTokens: 120,
    });
    if (result.ok && result.text.trim()) {
      text = `${text}\n\n${result.text.trim()}`;
    }
  } catch { /* deterministic fallback is fine */ }

  return { type, title, text, action, actionLabel };
}
