import { all, get } from '../db/index.js';
import { oneShot } from './chat.js';
import { getInsights } from './insights.js';
import { createMemory } from './memory.js';

function extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

const KIND_HINT = `حلّل النص التالي وحدد نوعه بدقة:
- "task": طلب تنفيذ شيء، أو شراء شيء، أو التزام بموعد أو عمل. (مثل: "اشتري قهوة غداً"، "أرسل الرسالة"، "راجع الفصل 4")
- "journal": وصف مشاعر، أو يومه، أو شعور بالإرهاق أو التوتر أو السعادة. (مثل: "أشعر بالإرهاق"، "اليوم كان متعباً")
- "gratitude": امتنان أو شكر صريح.
- "question": سؤال أو طلب معلومات أو نصيحة.
أعد JSON فقط بهذا الشكل إن كان النوع task أو journal أو gratitude:
{"kind":"task","title":"عنوان قصير واضح","due":"YYYY-MM-DD أو فارغ","priority":"high|medium|low","energy":"high|medium|low"}
{"kind":"journal","title":"عنوان قصير","content":"ملخص الجملة"}
{"kind":"gratitude","items":["...","...","..."]}
وإن كان النوع question فاكتب الرد مباشرة نصاً دون JSON.`;

// Local heuristic fallback used when the model returns free text instead of JSON.
function classifyLocally(text) {
  const t = text.trim();
  const emotion = /أشعر|تعب|إرهاق|قلق|توتر|حزن|سعيد|فرح|غاضب|ضغط|مزاج|خوف|كسل|مرهق|متعب|مستاء|أتعبت|تتعبني/i;
  const action = /^(اشتر|اشتري|أرسل|ارسل|راجع|حل|اكمل|أكمل|اتصل|اقرأ|ذاكر|ادرس|نظف|جهز|احجز|ادفع|جهّز|حضر|اكتب|اطبع|طبخ|أعد|غيّر|اسأل|اترك|زور)/i;
  const gratitude = /امتنان|أشكر|شاكر|الحمد لله|شكراً|ممنون|نعمة/i;
  const question = /\?|؟|ما هو|ما هي|كيف|لماذا|اشرح|ماذا|أين|متى|هل/i;
  if (gratitude.test(t)) return { kind: 'gratitude', items: [t] };
  if (question.test(t)) return { kind: 'question' };
  if (emotion.test(t) && !action.test(t)) return { kind: 'journal', title: t.slice(0, 30), content: t };
  if (action.test(t)) return { kind: 'task', title: t, due: null, priority: 'medium', energy: 'medium' };
  return { kind: 'journal', title: t.slice(0, 30), content: t };
}

/**
 * Smart quick-capture interpretation: "Buy coffee tomorrow" → task,
 * "I feel exhausted" → journal, etc.
 */
export async function interpret({ text } = {}) {
  const r = await oneShot({ systemPrompt: KIND_HINT, userContent: text, maxTokens: 500 });
  if (!r.ok) return r;
  const json = extractJson(r.text);
  if (!json || !json.kind) {
    const local = classifyLocally(text);
    if (local.kind === 'question') {
      return { ok: true, kind: 'question', answer: r.text, text: r.text, fallback: false };
    }
    if (local.kind === 'gratitude') {
      return { ok: true, kind: 'gratitude', suggestion: { items: local.items }, fallback: false };
    }
    if (local.kind === 'journal') {
      return { ok: true, kind: 'journal', suggestion: { title: local.title, content: local.content }, fallback: false };
    }
    return { ok: true, kind: 'task', suggestion: { title: local.title, due: local.due, priority: local.priority, energy: local.energy }, fallback: false };
  }
  if (json.kind === 'task') {
    return { ok: true, kind: 'task', suggestion: { title: json.title, due: json.due || null, priority: json.priority || 'medium', energy: json.energy || 'medium' }, fallback: false };
  }
  if (json.kind === 'journal') {
    return { ok: true, kind: 'journal', suggestion: { title: json.title || '', content: json.content || text }, fallback: false };
  }
  if (json.kind === 'gratitude') {
    return { ok: true, kind: 'gratitude', suggestion: { items: Array.isArray(json.items) ? json.items : [text] }, fallback: false };
  }
  return { ok: true, kind: 'question', answer: r.text, text: r.text, fallback: false };
}

const SAFE_FRAMEWORK = `أنت مساعد "العيش الآمن". حلّل الموقف التالي بهدوء وبدون تشخيص طبي، وفق البنية:
## ما يحدث الآن
وصف موجز بناءً على الحقائق.
## ما قد يعنيه
2-3 تفسيرات محتملة مع الإبقاء على عدم اليقين.
## ما نعرفه / ما لا نعرفه
حقائق ومجهولات منفصلة.
## ما تحت سيطرتك
أشياء واقعية يمكن للمستخدم فعلها.
## خطوتك الآن
خطوة واحدة صغيرة قابلة للتنفيذ (Minimum Safe Action).
ميّز بين القرارات القابلة للعكس وصعبة العكس. لا تختلق أرقام طوارئ. لا تكن متحمساً بشكل مصطنع.`;

export async function analyzeSafe({ text } = {}) {
  const r = await oneShot({ systemPrompt: SAFE_FRAMEWORK, userContent: text, maxTokens: 900 });
  return r;
}

const JOURNAL_SUMMARY = `أنت محلل يوميات هادئ. اقرأ الإدخال التالي وقدم:
1. ملخصاً موجزاً (سطران كحد أقصى) دون أحكام.
2. ملاحظة هادئة واحدة عن نمط أو شعور إن وُجد بوضوح.
لا تتفلسف ولا تكن متحمساً بشكل مصطنع.`;

export async function summarizeJournal({ journal_id: entryId } = {}) {
  const entry = get('SELECT * FROM journal_entries WHERE id = ?', entryId);
  if (!entry) return { ok: false, error: 'الإدخال غير موجود' };
  if (!entry.ai_access) return { ok: false, error: 'هذا الإدخال غير مسموح للذكاء الاصطناعي بقراءته', privacy: true };
  const content = `العنوان: ${entry.title || 'بدون عنوان'}\nالتاريخ: ${entry.entry_date}${entry.mood ? `\nالمزاج: ${entry.mood}` : ''}\n\n${entry.content.slice(0, 3000)}`;
  const r = await oneShot({ systemPrompt: JOURNAL_SUMMARY, userContent: content, maxTokens: 600 });
  return r;
}

const TUTOR = {
  explain: `أنت مرشد دراسي. اشرح الموضوع المطلوب ببساطة ووضوح، أعط مثالاً واحداً، واكتب سؤالاً واحداً للتأكد من الفهم. استخدم العربية مع المصطلحات التقنية بالإنجليزية.`,
  quiz: `أنت مرشد دراسي. اطرح 3 أسئلة متدرجة الصعوبة عن الموضوع المطلوب (اختيار من متعدد). لا تعطِ الإجابات في نهاية السؤال؛ أشر إلى أن المستخدم سيجيب ثم راجع إجاباته.`,
  flashcards: `أنت مرشد دراسي. أنشئ 5 بطاقات مراجعة عن الموضوع المطلوب بصيغة:
**س1:** ...
**ج1:** ...
واحدة تلو الأخرى.`,
  practice: `أنت مرشد دراسي. أعطِ تمرينين تطبيقيين عن الموضوع المطلوب مع تلميح بسيط لكل تمرين، ولا تحلّهما كاملاً.`,
};

export async function tutor({ course_id: courseId, mode, question } = {}) {
  const course = get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return { ok: false, error: 'المادة غير موجودة' };
  const topics = all('SELECT title FROM course_topics WHERE course_id = ? ORDER BY created_at LIMIT 12', courseId).map((t) => t.title);
  const topicLine = topics.length ? `\nمواضيع المادة: ${topics.join('، ')}` : '';
  const systemPrompt = TUTOR[mode] || TUTOR.explain;
  const userContent = `المادة: ${course.name}${course.code ? ` (${course.code})` : ''}${topicLine}\n\n${question ? `الموضوع المطلوب: ${question}` : 'اختر أنت موضوعاً مهماً من مواضيع المادة.'}`;
  const r = await oneShot({ systemPrompt, userContent, maxTokens: 1000 });
  return r;
}

const MEMORY_EXTRACT = `استخرج من البيانات التالية ذكريات دائمة مفيدة عن المستخدم (تفضيلات، حقائق، أحداث مهمة، عادات، إنجازات، أنماط).
أعد JSON فقط:
{"memories":[{"content":"...","type":"preference|general|episodic|semantic|project","importance":0.5}]}
بحد أقصى 5 ذكريات. إن لم يوجد شيء مهم أعد {"memories":[]}.`;

/**
 * AI memory consolidation: scans every field in the app (journal, tasks,
 * check-ins, milestones, focus, work notes, conversations) and proposes
 * durable memories for the user to approve.
 */
export async function suggestMemories() {
  const days = 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const blocks = [];

  const journal = all(
    'SELECT title, content, entry_date FROM journal_entries WHERE ai_access = 1 AND created_at >= ? ORDER BY entry_date DESC LIMIT 6',
    since,
  );
  if (journal.length) {
    blocks.push('— اليوميات —\n' + journal.map((j) => `[${j.entry_date}] ${j.title}\n${j.content.slice(0, 350)}`).join('\n\n'));
  }

  const tasks = all(
    "SELECT title, status, completed_at FROM tasks WHERE (completed_at >= ? OR created_at >= ?) AND status != 'cancelled' ORDER BY completed_at DESC LIMIT 10",
    since,
    since,
  );
  if (tasks.length) {
    blocks.push('— المهام —\n' + tasks.map((t) => `[${t.status}] ${t.title}${t.completed_at ? ` (أُنجزت ${t.completed_at.slice(0, 10)})` : ''}`).join('\n'));
  }

  const checkins = all('SELECT entry_date, energy, stress, sleep_hours, concern FROM checkins WHERE created_at >= ? ORDER BY entry_date DESC LIMIT 7', since);
  if (checkins.length) {
    blocks.push('— تسجيلات الحالة —\n' + checkins.map((c) => `[${c.entry_date}] طاقة ${c.energy ?? '?'}/5 ضغط ${c.stress ?? '?'}/5 نوم ${c.sleep_hours ?? '?'}س${c.concern ? ` — الهم: ${c.concern}` : ''}`).join('\n'));
  }

  const milestones = all('SELECT m.title, g.title AS goal FROM goal_milestones m LEFT JOIN goals g ON g.id = m.goal_id WHERE m.done = 1 ORDER BY m.created_at DESC LIMIT 6');
  if (milestones.length) {
    blocks.push('— مراحل الأهداف —\n' + milestones.map((m) => `أنجز مرحلة: ${m.title}${m.goal ? ` (${m.goal})` : ''}`).join('\n'));
  }

  const focus = all('SELECT minutes, started_at FROM focus_sessions WHERE completed = 1 AND started_at >= ? ORDER BY started_at DESC LIMIT 6', since);
  if (focus.length) {
    blocks.push('— جلسات التركيز —\n' + focus.map((f) => `${f.minutes} دقيقة في ${f.started_at.slice(0, 10)}`).join('\n'));
  }

  const workNotes = all('SELECT title, content FROM work_notes WHERE created_at >= ? ORDER BY created_at DESC LIMIT 4', since);
  if (workNotes.length) {
    blocks.push('— ملاحظات العمل —\n' + workNotes.map((w) => `${w.title}: ${w.content.slice(0, 200)}`).join('\n'));
  }

  const messages = all(
    `SELECT m.content, m.role FROM messages m
     WHERE m.role IN ('user','assistant') AND m.conversation_id IN (
       SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 3
     ) ORDER BY m.created_at DESC LIMIT 12`,
  );
  if (messages.length) {
    blocks.push('— المحادثات —\n' + messages.map((m) => `[${m.role}] ${m.content.slice(0, 250)}`).join('\n'));
  }

  const source = blocks.join('\n\n');
  if (!source.trim()) return { ok: true, candidates: [], fallback: false };

  const r = await oneShot({ systemPrompt: MEMORY_EXTRACT, userContent: source.slice(0, 7000), maxTokens: 900 });
  if (!r.ok) return r;
  const json = extractJson(r.text);
  const memories = json?.memories || [];
  return {
    ok: true,
    candidates: memories
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(0, 5)
      .map((m) => ({ content: m.content.trim(), type: m.type || 'general', importance: Number(m.importance) || 0.5 })),
    fallback: false,
  };
}

export async function saveSuggestedMemory({ candidate } = {}) {
  if (!candidate?.content) return { ok: false, error: 'لا يوجد محتوى' };
  const mem = createMemory({
    content: candidate.content,
    type: candidate.type || 'general',
    importance: candidate.importance ?? 0.5,
    source: 'ai-suggestion',
    confidence: 0.6,
  });
  return { ok: true, memory: mem };
}

const INSIGHTS_NARRATIVE = `أنت محلل بيانات هادئ. بناءً على الإحصائيات التالية اكتب فقرة واحدة (بحد أقصى 6 أسطر) بلغة وصفية تربط الملاحظات دون ادعاء علاقات سببية، وتجنب إلقاء اللوم أو خلق الشعور بالذنب. استخدم صيغة مثل "في الأيام التي...".`;

export async function insightsSummary() {
  const insights = getInsights();
  const r = await oneShot({ systemPrompt: INSIGHTS_NARRATIVE, userContent: JSON.stringify(insights), maxTokens: 500 });
  return r;
}

const GOAL_REVIEW = `أنت مستشار أهداف هادئ. راجع الهدف التالي وتقدمه، ثم اقترح خطوة واحدة واقعية قابلة للتنفيذ هذا الأسبوع. كن موجزاً (4 أسطر كحد أقصى) ودون أحكام.`;

export async function reviewGoal(goalId) {
  const goal = get('SELECT * FROM goals WHERE id = ?', goalId);
  if (!goal) return { ok: false, error: 'الهدف غير موجود' };
  const milestones = all('SELECT title, done FROM goal_milestones WHERE goal_id = ? ORDER BY created_at', goalId);
  const projects = all('SELECT name FROM projects WHERE goal_id = ?', goalId);
  const content = `الهدف: ${goal.title}\nالمجال: ${goal.life_area || 'عام'}\nالتاريخ المستهدف: ${goal.target_date || 'غير محدد'}\nالمراحل: ${milestones.map((m) => `${m.done ? '✓' : '○'} ${m.title}`).join(' | ')}\nالمشاريع: ${projects.map((p) => p.name).join('، ') || 'لا يوجد'}`;
  const r = await oneShot({ systemPrompt: GOAL_REVIEW, userContent: content, maxTokens: 500 });
  return r;
}

const DAY_PLAN = `أنت منظم يوم هادئ. بناءً على مهام اليوم وجدوله وحالته، اقترح خطة يوم واقعية ومرتبة بترتيب الأولوية (بحد أقصى 8 بنود) مع تلميح واحد للراحة. راعي مستوى الطاقة والضغط إن وردا. لا تكن متحمساً بشكل مصطنع.`;

export async function planDay() {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = all(
    "SELECT title, priority, energy, est_minutes FROM tasks WHERE status NOT IN ('done','cancelled') AND (due_date IS NULL OR due_date = ?) ORDER BY priority LIMIT 15",
    today,
  );
  const events = all('SELECT title, start, category FROM calendar_events WHERE start LIKE ? ORDER BY start LIMIT 10', `${today}%`);
  const checkin = get('SELECT * FROM checkins WHERE entry_date = ?', today);
  const content = [
    'المهام:',
    tasks.length ? tasks.map((t) => `- [${t.priority}] ${t.title}${t.est_minutes ? ` (${t.est_minutes}د)` : ''}`).join('\n') : '- لا توجد',
    'الجدول:',
    events.length ? events.map((e) => `- ${e.start.slice(11, 16)} ${e.title}`).join('\n') : '- لا يوجد',
    checkin ? `الحالة: طاقة ${checkin.energy || '?'}/5، ضغط ${checkin.stress || '?'}/5، نوم ${checkin.sleep_hours || '?'}س` : '',
  ].join('\n');
  const r = await oneShot({ systemPrompt: DAY_PLAN, userContent: content, maxTokens: 700 });
  return r;
}

const NEXT_TASK = `أنت منظم مهام هادئ. من القائمة التالية اختر المهمة الأكثر أهمية الآن (ليس الأسهل بالضرورة، ولا تزدحم) مع سبب وجيه في سطر واحد. إن كانت القائمة فارغة قل ذلك بلطف.`;

export async function nextTask() {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = all(
    "SELECT title, priority, energy, due_date, est_minutes FROM tasks WHERE status NOT IN ('done','cancelled') ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date LIMIT 12",
  );
  const content = tasks.length
    ? tasks.map((t) => `- [${t.priority}] ${t.title}${t.due_date ? ` (استحقاق ${t.due_date === today ? 'اليوم' : t.due_date})` : ''}${t.est_minutes ? ` (~${t.est_minutes}د)` : ''}`).join('\n')
    : 'لا توجد مهام.';
  const r = await oneShot({ systemPrompt: NEXT_TASK, userContent: content, maxTokens: 300 });
  return r;
}

/* ---------------- Cross-domain day/week synthesis ---------------- */

const SYNTHESIS = `أنت محلل حياة هادئ داخل تطبيق شخصي. استعرض ملخص نشاط المستخدم عن الفترة المطلوبة وقدّم توليفة منظمة بالعربية:
## ما مضى جيدًا
2-4 نقاط.
## ما يحتاج انتباهًا
1-3 نقاط واقعية دون لوم.
## أنماط ملحوظة
ملاحظات وصفية حذرة (لا سببية قطعية).
## خطوات عملية قادمة
2-3 خطوات صغيرة.
كن دقيقًا ومقتضبًا، ولا تختلق بيانات غير موجودة في الملخص.`;

export async function synthesize({ period = 'week', days = 7 }) {
  const since = new Date(Date.now() - (days || 7) * 86400000).toISOString();
  const data = {
    period,
    tasksDone: all('SELECT title, completed_at FROM tasks WHERE status = ? AND completed_at >= ? LIMIT 20', 'done', since),
    tasksOpen: all("SELECT title, priority, due_date FROM tasks WHERE status NOT IN ('done','cancelled') LIMIT 20"),
    focus: all('SELECT minutes, started_at FROM focus_sessions WHERE completed = 1 AND started_at >= ? LIMIT 20', since),
    journal: all('SELECT title, entry_date FROM journal_entries WHERE ai_access = 1 AND created_at >= ? LIMIT 10', since),
    checkins: all('SELECT entry_date, energy, stress, sleep_hours FROM checkins WHERE created_at >= ? LIMIT 14', since),
    milestones: all('SELECT m.title, g.title AS goal FROM goal_milestones m LEFT JOIN goals g ON g.id = m.goal_id WHERE m.done = 1 LIMIT 10'),
    grades: all('SELECT e.title, e.grade, c.name AS course FROM exams e JOIN courses c ON c.id = e.course_id WHERE e.grade IS NOT NULL LIMIT 10'),
    work: all('SELECT title FROM work_notes WHERE created_at >= ? LIMIT 10', since),
    safe: all('SELECT sp.name, s.activated_at FROM safe_living_sessions s JOIN safe_living_plans sp ON sp.id = s.plan_id WHERE s.activated_at >= ? LIMIT 5', since),
    memories: all('SELECT content, created_at FROM memories WHERE created_at >= ? LIMIT 10', since),
  };
  const r = await oneShot({ systemPrompt: SYNTHESIS, userContent: JSON.stringify(data), maxTokens: 900 });
  return r;
}

export async function saveSynthesis({ text, kind = 'journal' }) {
  if (!text) return { ok: false, error: 'لا يوجد نص' };
  if (kind === 'memory') {
    const mem = createMemory({ content: text.slice(0, 500), type: 'general', importance: 0.6, source: 'synthesis' });
    return { ok: true, entity: { type: 'memory', id: mem.id } };
  }
  const { run } = await import('../db/index.js');
  const { uid, nowIso, dateKey } = await import('../lib/util.js');
  const id = uid('journal-');
  run(
    'INSERT INTO journal_entries(id, title, content, entry_date, tags, ai_access, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    id, `ملخص ${kind === 'week' ? 'الأسبوع' : 'اليوم'}`, text, dateKey(), '[]', 1, nowIso(), nowIso(),
  );
  return { ok: true, entity: { type: 'journal', id } };
}

export const ACTIONS = {
  interpret,
  'analyze-safe': analyzeSafe,
  'journal-summary': summarizeJournal,
  tutor,
  'memory-suggest': suggestMemories,
  'memory-save': saveSuggestedMemory,
  'insights-summary': insightsSummary,
  'goal-review': reviewGoal,
  'plan-day': planDay,
  'next-task': nextTask,
  synthesize,
  'save-synthesis': saveSynthesis,
};
