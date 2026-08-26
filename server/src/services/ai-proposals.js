import { all, get, run } from '../db/index.js';
import { uid, nowIso, dateKey } from '../lib/util.js';
import { oneShot } from './chat.js';
import { getAiPermissions } from './life-context.js';
import { createMemory } from './memory.js';
import { logActivity } from './activity.js';
import { emitDomainEvent, EVENT_TYPES } from './events.js';

const PROPOSAL_SCHEMA = `أنت مساعد شخصي يعمل داخل تطبيق "عِش آمن". يمكنك اقتراح إجراءات منظمة ينفذها المستخدم بنقرة.
بناءً على رسالة المستخدم (وسياق التطبيق إن وُجد)، اقترح إجراءات مفيدة فقط عند الحاجة. أعد JSON حصراً بهذا الشكل:
{"proposals":[{"type":"task","title":"عنوان المهمة","data":{"title":"...","due_date":"YYYY-MM-DD أو null","priority":"high|medium|low","energy":"low|medium|high"},"reason":"سبب مقنع قصير"},
{"type":"focus","title":"عنوان الجلسة","data":{"minutes":25|50|90,"task_id":"معرّف مهمة أو null"},"reason":"..."},
{"type":"goal","title":"عنوان الهدف","data":{"title":"...","life_area":"education|work|health|personal|..."},"reason":"..."},
{"type":"milestone","title":"عنوان المرحلة","data":{"goal_id":"...","title":"..."},"reason":"..."},
{"type":"journal","title":"إدخال يوميات","data":{"title":"...","content":"..."},"reason":"..."},
{"type":"exam","title":"تسجيل امتحان","data":{"course_id":"...","title":"...","exam_date":"YYYY-MM-DD أو null"},"reason":"..."},
{"type":"work_note","title":"ملاحظة عمل","data":{"title":"...","content":"..."},"reason":"..."},
{"type":"memory","title":"حفظ ذكرى","data":{"content":"...","type":"preference|general|episodic|semantic"},"reason":"..."},
{"type":"safe_action","title":"تفعيل خطة","data":{"plan_id":"..."},"reason":"..."}]}
قواعد: لا تقترح أكثر من 5 إجراءات. لا تقترح إجراءات مكررة. البيانات الاختيارية تكون null. إذا لم تكن هناك حاجة لأي إجراء أعد {"proposals":[]}. لا تختلق معرفات (IDs) إن لم تكن معروفة — اتركها null.`;

function extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

const WRITE_KEY = { task: 'tasks', focus: 'tasks', goal: 'goals', milestone: 'goals', journal: 'journal', exam: 'study', work_note: 'work_notes', memory: 'memories', safe_action: 'safe' };

/** Ask the local model to propose structured actions for the user's message. */
export async function proposeActions({ message, contextText = '' }) {
  const perms = getAiPermissions().write;
  const r = await oneShot({
    systemPrompt: PROPOSAL_SCHEMA,
    userContent: `${contextText ? `سياق التطبيق:\n${contextText}\n\n` : ''}رسالة المستخدم: ${message}`,
    maxTokens: 900,
  });
  if (!r.ok) return { ok: false, proposals: [], error: r.error, fallback: true };
  const json = extractJson(r.text);
  const raw = Array.isArray(json?.proposals) ? json.proposals : [];
  const proposals = raw
    .filter((p) => p && p.type && (p.data || p.title))
    .map((p) => ({
      type: p.type,
      title: p.title || p.data?.title || '',
      reason: p.reason || '',
      data: p.data || {},
    }))
    .filter((p) => {
      const key = WRITE_KEY[p.type];
      return key ? perms[key] !== false : true;
    })
    .slice(0, 5);
  return { ok: true, proposals, fallback: false, model: r.model };
}

/**
 * Execute a user-approved proposal. Enforces AI write permissions and
 * creates the entity through the same primitives the REST routes use.
 */
export function executeProposal(proposal) {
  const perms = getAiPermissions().write;
  const key = WRITE_KEY[proposal.type];
  if (key && perms[key] === false) {
    return { ok: false, error: 'صلاحية الكتابة لهذا النوع معطّلة في الإعدادات' };
  }
  const d = proposal.data || {};
  switch (proposal.type) {
    case 'task': {
      const id = uid('task-');
      run(
        'INSERT INTO tasks(id, title, priority, energy, due_date, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        id, d.title || proposal.title || 'مهمة', d.priority || 'medium', d.energy || 'medium', d.due_date || null, 'inbox', nowIso(), nowIso(),
      );
      emitDomainEvent(EVENT_TYPES.TASK_CREATED, { entityType: 'task', entityId: id, title: d.title });
      return { ok: true, entity: { type: 'task', id, title: d.title } };
    }
    case 'focus': {
      let taskId = d.task_id || null;
      if (taskId && !get('SELECT id FROM tasks WHERE id = ?', String(taskId))) taskId = null; // fabricated id
      const id = uid('focus-');
      run('INSERT INTO focus_sessions(id, started_at, minutes, task_id, completed) VALUES (?,?,?,?,?)', id, nowIso(), d.minutes || 25, taskId, 1);
      emitDomainEvent(EVENT_TYPES.FOCUS_COMPLETED, { entityType: 'focus_session', entityId: id, minutes: d.minutes || 25, date: dateKey() });
      return { ok: true, entity: { type: 'focus_session', id, title: `${d.minutes || 25} دقيقة` } };
    }
    case 'goal': {
      const id = uid('goal-');
      run('INSERT INTO goals(id, title, life_area, status, progress) VALUES (?,?,?,?,?)', id, d.title || proposal.title || 'هدف', d.life_area || null, 'active', 0);
      emitDomainEvent(EVENT_TYPES.GOAL_PROGRESS_CHANGED, { entityType: 'goal', entityId: id, title: d.title });
      return { ok: true, entity: { type: 'goal', id, title: d.title } };
    }
    case 'milestone': {
      // Never trust model-provided IDs: verify, then fall back to title match.
      let goalId = d.goal_id ? (get('SELECT id FROM goals WHERE id = ?', String(d.goal_id)) ? d.goal_id : null) : null;
      if (!goalId) {
        const goals = all("SELECT id, title FROM goals WHERE status = 'active'");
        const goal = bestTitleMatch(proposal.title || d.title || '', goals.map((g) => ({ id: g.id, title: g.title })));
        if (!goal) return { ok: false, error: 'المرحلة تحتاج إلى هدف — أنشئ هدفًا أولاً أو حدد هدفًا' };
        goalId = goal.id;
      }
      const id = uid('ms-');
      run('INSERT INTO goal_milestones(id, goal_id, title, done) VALUES (?,?,?,?)', id, goalId, d.title || 'مرحلة', 0);
      return { ok: true, entity: { type: 'milestone', id, title: d.title } };
    }
    case 'journal': {
      const id = uid('journal-');
      run(
        'INSERT INTO journal_entries(id, title, content, entry_date, tags, ai_access, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        id, d.title || '', d.content || proposal.title || '', dateKey(), '[]', 1, nowIso(), nowIso(),
      );
      emitDomainEvent(EVENT_TYPES.JOURNAL_CREATED, { entityType: 'journal', entityId: id, title: d.title });
      return { ok: true, entity: { type: 'journal', id, title: d.title || d.content?.slice(0, 40) } };
    }
    case 'exam': {
      // Never trust model-provided course_id: verify, then title-match fallback.
      let courseId = d.course_id ? (get('SELECT id FROM courses WHERE id = ?', String(d.course_id)) ? d.course_id : null) : null;
      if (!courseId) {
        const courses = all('SELECT id, name FROM courses').map((c) => ({ id: c.id, title: c.name }));
        const course = bestTitleMatch(proposal.title || d.title || '', courses);
        if (!course) {
          return { ok: false, error: `الامتحان يحتاج إلى مادة. المواد المتاحة: ${courses.map((c) => c.title).join('، ') || 'لا توجد مواد'}` };
        }
        courseId = course.id;
      }
      const id = uid('exam-');
      run('INSERT INTO exams(id, course_id, title, exam_type, exam_date) VALUES (?,?,?,?,?)', id, courseId, d.title || proposal.title || 'امتحان', 'OTHER', d.exam_date || null);
      emitDomainEvent(EVENT_TYPES.EXAM_CREATED, { entityType: 'exam', entityId: id, title: d.title });
      return { ok: true, entity: { type: 'exam', id, title: d.title } };
    }
    case 'work_note': {
      const id = uid('wn-');
      run('INSERT INTO work_notes(id, title, content, tags, created_at, updated_at) VALUES (?,?,?,?,?,?)', id, d.title || 'ملاحظة', d.content || '', '[]', nowIso(), nowIso());
      emitDomainEvent(EVENT_TYPES.WORK_NOTE_CREATED, { entityType: 'work_note', entityId: id, title: d.title });
      return { ok: true, entity: { type: 'work_note', id, title: d.title } };
    }
    case 'memory': {
      const mem = createMemory({ content: d.content || proposal.title || '', type: d.type || 'general', importance: 0.6, source: 'ai-proposal', aiAccess: true });
      return { ok: true, entity: { type: 'memory', id: mem.id, title: d.content?.slice(0, 60) } };
    }
    case 'safe_action': {
      // Verify or resolve the plan id (the model may fabricate one).
      let planId = d.plan_id ? (get('SELECT id FROM safe_living_plans WHERE id = ?', String(d.plan_id)) ? d.plan_id : null) : null;
      if (!planId) {
        const plans = all('SELECT id, name FROM safe_living_plans').map((p) => ({ id: p.id, title: p.name }));
        const plan = bestTitleMatch(proposal.title || d.title || '', plans);
        if (!plan) return { ok: false, error: 'اختر خطة عيش آمن' };
        planId = plan.id;
      }
      run("UPDATE safe_living_sessions SET status = 'ended' WHERE status = 'active'");
      const id = uid('sls-');
      run('INSERT INTO safe_living_sessions(id, plan_id, status) VALUES (?,?,?)', id, planId, 'active');
      const plan = get('SELECT name FROM safe_living_plans WHERE id = ?', planId);
      emitDomainEvent(EVENT_TYPES.SAFE_PLAN_ACTIVATED, { entityType: 'safe_living_plan', entityId: planId, title: plan?.name, sessionId: id });
      return { ok: true, entity: { type: 'safe_living_plan', id: planId, title: plan?.name } };
    }
    default:
      return { ok: false, error: `نوع غير معروف: ${proposal.type}` };
  }
}

/** What the assistant may act on, for the proposal prompt context. */
export function proposalContextText() {
  const activeGoals = all("SELECT title FROM goals WHERE status = 'active' LIMIT 4").map((g) => `هدف: ${g.title}`);
  const courses = all('SELECT name FROM courses LIMIT 4').map((c) => `مادة: ${c.name}`);
  const plans = all('SELECT name FROM safe_living_plans LIMIT 3').map((p) => `خطة: ${p.name}`);
  return [...activeGoals, ...courses, ...plans].join('\n');
}

/** Best title match by token overlap (used to resolve missing IDs in proposals). */
function bestTitleMatch(query, options) {
  if (!options?.length) return null;
  const tokens = (s) =>
    new Set(
      String(s || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const q = tokens(query);
  let best = null;
  let bestScore = 0;
  for (const opt of options) {
    let score = 0;
    for (const w of tokens(opt.title)) {
      for (const x of q) {
        if (w === x || (w.length >= 4 && (w.includes(x) || x.includes(w)))) {
          score += 1;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return bestScore >= 1 ? best : null;
}
