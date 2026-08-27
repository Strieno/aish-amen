import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { uid, nowIso, parseJson } from '../lib/util.js';
import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';
import { oneShot } from '../services/chat.js';
import * as engine from '../services/study-engine.js';

const r = Router();

/* ---------------- Study Command Center dashboard ---------------- */

r.get('/study/dashboard', (_req, res) => {
  const courses = all('SELECT id, name, code FROM courses ORDER BY created_at DESC');
  const nextExam = get('SELECT e.*, c.name AS course_name FROM exams e JOIN courses c ON c.id = e.course_id WHERE e.exam_date >= date(\'now\') ORDER BY e.exam_date LIMIT 1') || null;
  const week = engine.weeklySeries(7);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const previousWeek = engine.weeklySeries(14).slice(0, 7).reduce((s, d) => s + d.minutes, 0);
  const plan = engine.todayPlan();
  const recommendations = engine.recommendNow({ limit: 3 });
  const momentum = engine.academicMomentum();
  const weak = all(
    `SELECT t.id, t.title, t.mastery, c.name AS course_name FROM course_topics t JOIN courses c ON c.id = t.course_id
     WHERE t.mastery > 0 AND t.mastery < 45 ORDER BY t.mastery ASC LIMIT 5`,
  ).map((t) => ({ ...t, mastery: Math.round(t.mastery || 0) }));
  const streak = engine.studyStreak();
  const examReadiness = nextExam ? engine.examReadiness(nextExam) : null;
  const due = engine.dueFlashcards(null, 99).length;

  res.json({
    coursesCount: courses.length,
    nextExam,
    weekMinutes,
    previousWeekMinutes: previousWeek,
    weeklyProgress: previousWeek > 0 ? Math.min(100, Math.round((weekMinutes / previousWeek) * 100)) : (weekMinutes > 0 ? 100 : 0),
    streak,
    momentum,
    plan,
    recommendations,
    weakAreas: weak,
    examReadiness,
    dueFlashcards: due,
    recommendedToday: plan.totalMinutes || 20,
  });
});

/* ---------------- Analytics ---------------- */

r.get('/study/analytics', (req, res) => {
  const days = Math.min(60, Math.max(7, Number(req.query.days) || 14));
  res.json({
    weekly: engine.weeklySeries(Math.min(14, days)),
    subjectDistribution: engine.subjectDistribution(30),
    accuracyTrend: engine.accuracyTrend(days),
    masteryTrend: engine.masteryTrend(days),
    heatmap: engine.heatmap(35),
    weak: all(
      `SELECT t.id, t.title, t.mastery, c.name AS course_name FROM course_topics t JOIN courses c ON c.id = t.course_id
       WHERE t.mastery > 0 ORDER BY t.mastery ASC LIMIT 5`,
    ).map((t) => ({ ...t, mastery: Math.round(t.mastery || 0) })),
    strong: all(
      `SELECT t.id, t.title, t.mastery, c.name AS course_name FROM course_topics t JOIN courses c ON c.id = t.course_id
       WHERE t.mastery >= 65 ORDER BY t.mastery DESC LIMIT 5`,
    ).map((t) => ({ ...t, mastery: Math.round(t.mastery || 0) })),
    consistency: engine.weeklySeries(30).filter((d) => d.minutes > 0).length,
    totalTopics: all('SELECT COUNT(*) AS n FROM course_topics')[0].n,
    masteredTopics: all('SELECT COUNT(*) AS n FROM course_topics WHERE mastery >= 85')[0].n,
    focusAvg: get('SELECT AVG(minutes) AS m FROM focus_sessions WHERE completed = 1 AND started_at >= ?', new Date(Date.now() - 30 * 86400000).toISOString())?.m || 0,
    mistakesAnalysis: engine.mistakeAnalysisText(),
  });
});

/* ---------------- Plan ---------------- */

r.get('/study/plan/today', (_req, res) => {
  res.json(engine.todayPlan());
});

r.post('/study/plan/generate', (req, res) => {
  const minutes = Math.min(600, Math.max(60, Number(req.body?.availableMinutes) || 240));
  const items = engine.generateWeeklyPlan({ availableMinutes: minutes });
  for (const item of items) {
    run('INSERT OR REPLACE INTO study_plan_items(id, date, course_id, topic_id, minutes, reason) VALUES (?,?,?,?,?,?)', uid('plan-'), item.date, item.courseId, item.topicId, item.minutes, item.reason);
  }
  res.json({ items: items.length });
});

r.get('/study/plan/week', (_req, res) => {
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  const items = all('SELECT * FROM study_plan_items WHERE date BETWEEN ? AND ? ORDER BY date', from, to);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayItems = items.filter((i) => i.date === todayStr);
  // If today is empty, offer a deterministic plan.
  const plan = todayItems.length ? { items: todayItems } : engine.todayPlan();
  res.json({ week: items, today: plan });
});

/* ---------------- Study sessions ---------------- */

r.post('/study/sessions', (req, res) => {
  const b = req.body || {};
  const id = uid('ss-');
  const minutes = Math.min(600, Math.max(1, Number(b.minutes) || 0));
  run(
    'INSERT INTO study_sessions(id, course_id, topic_id, started_at, ended_at, minutes, type, difficulty_felt, understanding, notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id,
    b.course_id || null,
    b.topic_id || null,
    b.started_at || nowIso(),
    nowIso(),
    minutes,
    b.type || 'study',
    b.difficulty_felt || null,
    b.understanding != null ? Number(b.understanding) : null,
    b.notes || '',
  );
  if (b.topic_id) engine.refreshTopicMastery(b.topic_id, { review: true });
  if (b.course_id) {
    emitDomainEvent(EVENT_TYPES.FOCUS_COMPLETED, { entityType: 'focus_session', entityId: id, minutes, courseName: b.course_name });
  }
  res.status(201).json(get('SELECT * FROM study_sessions WHERE id = ?', id));
});

r.get('/study/sessions', (req, res) => {
  const days = Number(req.query.days) || 30;
  const from = new Date(Date.now() - days * 86400000).toISOString();
  res.json(
    all(
      `SELECT s.*, c.name AS course_name, t.title AS topic_title
       FROM study_sessions s LEFT JOIN courses c ON c.id = s.course_id LEFT JOIN course_topics t ON t.id = s.topic_id
       WHERE s.started_at >= ? ORDER BY s.started_at DESC LIMIT 100`,
      from,
    ),
  );
});

/* ---------------- Notes ---------------- */

r.get('/study/notes', (req, res) => {
  const { course_id, q } = req.query;
  const where = [];
  const params = [];
  if (course_id) {
    where.push('course_id = ?');
    params.push(course_id);
  }
  if (q) {
    where.push('(title LIKE ? OR content LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  params.push(200);
  const rows = all(`SELECT * FROM study_notes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT ?`, ...params);
  res.json(rows.map((row) => ({ ...row, tags: parseJson(row.tags, []) })));
});

r.post('/study/notes', (req, res) => {
  const b = req.body || {};
  const id = uid('note-');
  run('INSERT INTO study_notes(id, course_id, topic_id, title, content, tags) VALUES (?,?,?,?,?,?)', id, b.course_id || null, b.topic_id || null, b.title || 'ملاحظة', b.content || '', JSON.stringify(b.tags || []));
  res.status(201).json(get('SELECT * FROM study_notes WHERE id = ?', id));
});

r.put('/study/notes/:id', (req, res) => {
  const b = req.body || {};
  run('UPDATE study_notes SET title=?, content=?, tags=?, updated_at=? WHERE id=?', b.title, b.content || '', JSON.stringify(b.tags || []), nowIso(), req.params.id);
  res.json(get('SELECT * FROM study_notes WHERE id = ?', req.params.id));
});

r.delete('/study/notes/:id', (_req, res) => {
  run('DELETE FROM study_notes WHERE id = ?', _req.params.id);
  res.json({ ok: true });
});

/* ---------------- Flashcards ---------------- */

r.get('/study/flashcards', (req, res) => {
  const { course_id, topic_id, due } = req.query;
  if (due === '1') return res.json(engine.dueFlashcards(course_id));
  res.json(engine.allFlashcards({ courseId: course_id, topicId: topic_id }));
});

r.post('/study/flashcards', (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [{ front: b.front, back: b.back }];
  const created = [];
  for (const item of items) {
    if (!item?.front || !item?.back) continue;
    const id = uid('fc-');
    run('INSERT INTO flashcards(id, course_id, topic_id, front, back, difficulty) VALUES (?,?,?,?,?,?)', id, b.course_id || null, b.topic_id || null, String(item.front).trim(), String(item.back).trim(), b.difficulty || 'medium');
    created.push(get('SELECT * FROM flashcards WHERE id = ?', id));
  }
  res.status(201).json({ created });
});

r.post('/study/flashcards/:id/review', (req, res) => {
  const grade = req.body?.grade;
  if (!['again', 'hard', 'good', 'easy'].includes(grade)) return res.status(400).json({ error: 'grade required' });
  const card = engine.reviewFlashcard(req.params.id, grade);
  if (!card) return res.status(404).json({ error: 'not found' });
  if (card.topic_id) engine.refreshTopicMastery(card.topic_id, { review: true });
  res.json({ card });
});

r.delete('/study/flashcards/:id', (_req, res) => {
  run('DELETE FROM flashcards WHERE id = ?', _req.params.id);
  res.json({ ok: true });
});

/* ---------------- Quiz / Practice ---------------- */

r.post('/study/quiz/answer', (req, res) => {
  const b = req.body || {};
  const id = uid('qa-');
  const correct = b.correct === true || b.correct === 1 ? 1 : 0;
  run(
    'INSERT INTO quiz_attempts(id, course_id, topic_id, question, answer, correct, confidence, difficulty, source) VALUES (?,?,?,?,?,?,?,?,?)',
    id,
    b.course_id || null,
    b.topic_id || null,
    String(b.question || '').slice(0, 300),
    String(b.answer || '').slice(0, 300),
    correct,
    Math.min(5, Math.max(0, Number(b.confidence) || 0)),
    b.difficulty || 'medium',
    b.source || 'practice',
  );
  if (correct === 0) {
    engine.recordMistake({ courseId: b.course_id, topicId: b.topic_id, category: b.category || 'concept', question: b.question, userAnswer: b.answer, correctAnswer: b.correct_answer });
  }
  let mastery = null;
  if (b.topic_id) mastery = engine.refreshTopicMastery(b.topic_id, { review: correct === 1 });
  // High-confidence wrong answer = misconception → escalate the mistake.
  const misconception = correct === 0 && Number(b.confidence) >= 4;
  res.json({ ok: true, id, mastery, misconception });
});

/* ---------------- Mistakes ---------------- */

r.get('/study/mistakes', (_req, res) => {
  res.json(engine.mistakeSummary(30));
});

r.post('/study/mistakes/:id/resolved', (req, res) => {
  run('UPDATE mistakes SET resolved = 1 WHERE id = ?', req.params.id);
  const row = get('SELECT * FROM mistakes WHERE id = ?', req.params.id);
  if (row?.topic_id) engine.refreshTopicMastery(row.topic_id, { review: true });
  res.json({ ok: true });
});

/* ---------------- AI Study Tutor ---------------- */

r.post('/study/practice/question', async (req, res) => {
  const b = req.body || {};
  const topicText = String(b.topic || b.question || '').trim().slice(0, 400);
  const difficulty = String(b.difficulty || 'medium');
  if (!topicText) return res.status(400).json({ error: 'topic required' });

  const context = engine.buildStudyContext({ courseId: b.course_id, topicId: b.topic_id });
  const system = [
    'أنت مولّد أسئلة تعليمية تكيّفي. أنشئ سؤالًا واحدًا عن الموضوع المطلوب.',
    'أعد JSON فقط بصيغة: {"type":"mc"|"tf"|"short","question":"...","options":[".."] (لـ mc فقط),"correct":"...","explanation":"..."}',
    'مستوى الصعوبة المطلوب: ' + difficulty,
    'اجعله سؤالًا دقيقًا يختبر الفهم وليس الحفظ فقط، مع شرح تعليمي للسبب.',
  ].join('\n\n');
  const result = await oneShot({ systemPrompt: system, userContent: `الموضوع: ${topicText}\n\n${context ? `السياق:\n${context}` : ''}`, maxTokens: 700 });
  if (!result.ok) return res.status(502).json({ error: result.error, fallback: true });
  const parsed = parseVisualJson(result.text);
  if (!parsed || !parsed.question) return res.status(502).json({ error: 'لم يتمكن النموذج من توليد سؤال صالح', fallback: true });
  res.json({ ...parsed, difficulty, fallback: false });
});

const TUTOR_MODES = {
  explain: 'اشرح المفهوم بوضوح مع أمثلة عملية. كن موجزًا ومنظمًا.',
  simple: 'اشرح المفهوم بأبسط لغة ممكنة وكأنك تشرح لشخص عمره 12 عامًا، مع تشبيه بسيط.',
  socratic: 'لا تعطِ الحل مباشرة. وجه أسئلة متدرجة تساعد المستخدم على الوصول للإجابة بنفسه. سؤال واحد في كل مرة.',
  quiz: 'ولّد 3 أسئلة قصيرة عن المفهوم مع إجابات نموذجية في النهاية. بدّل أنواع الأسئلة.',
  example: 'اعرض مثالًا محلولًا خطوة بخطوة مع شرح سبب كل خطوة.',
  challenge: 'ارفع الصعوبة: أعطِ أسئلة أو تمارين أصعب من مستوى المستخدم الحالي واشرح الإجابات.',
  correct: 'قيّم فهم المستخدم: صحيح ما فهمه، وصحح المفاهيم الخاطئة بلطف، واذكر ما يحتاج مراجعته.',
  feynman: 'اطلب من المستخدم أن يشرح المفهوم بأسلوبه ثم قيّم الشرح وسدّ الثغرات بلطف (تقنية فينمان).',
  recap: 'مراجعة سريعة (5 دقائق): أهم 5 نقاط عن المفهوم مع سؤال استرجاع سريع.',
  exam: 'محاكاة سؤال امتحان بنمط الاختبارات، مع معايير التصحيح.',
  visual: 'اختر أفضل تمثيل بصري لهذا المفهوم واصفًا إياه بوضوح (خريطة مفاهيم، جدول، شجرة، رسم بياني...).',
};

r.post('/study/tutor', async (req, res) => {
  const b = req.body || {};
  const mode = TUTOR_MODES[b.mode] ? b.mode : 'explain';
  const question = String(b.question || '').trim().slice(0, 1200);
  if (!question) return res.status(400).json({ error: 'question required' });

  const context = engine.buildStudyContext({ courseId: b.course_id, topicId: b.topic_id });
  const system = [
    'أنت المرشد الدراسي داخل "عِش آمن" — معلم خصوصي هادئ ومحترف في التعليم الجامعي.',
    'مهمتك تطبيق مبادئ التعلم النشط: الاسترجاع، الأمثلة المحلولة، التصحيح، والفهم قبل الحفظ.',
    'أجب بلغة المستخدم وبإيجاز، واستخدم Markdown عند الحاجة.',
    `الوضع المطلوب: ${TUTOR_MODES[mode]}`,
    context ? `سياق المادة (بيانات فقط):\n${context}` : '',
    'لا تختلق معلومات عن ملفات أو مواد غير موجودة في السياق.',
  ].filter(Boolean).join('\n\n');

  const result = await oneShot({ systemPrompt: system, userContent: question, maxTokens: 1200 });
  if (!result.ok) return res.status(502).json({ error: result.error, fallback: true });
  res.json({ text: result.text, fallback: false });
});

/* ---------------- AI Visual Learning ---------------- */

r.post('/study/visualize', async (req, res) => {
  const b = req.body || {};
  const topicText = String(b.topic || '').trim().slice(0, 600);
  const concept = String(b.concept || topicText || '').trim().slice(0, 600);
  if (!concept) return res.status(400).json({ error: 'concept required' });

  const context = engine.buildStudyContext({ courseId: b.course_id, topicId: b.topic_id });
  const system = [
    'أنت محرك تصور تعليمي. حوّل المفهوم إلى هيكل JSON دقيق يعرضه التطبيق رسوميًا.',
    'أعد JSON فقط بدون أي نص آخر.',
    'الأنواع المدعومة: "concept-map" (nodes: [{id,label}], edges: [[fromId,toId]])، "flow" (steps: [{title,detail}])، "truth-table" (headers: [cols], rows: [[values]])، "timeline" (events: [{title,date}])، "comparison" (columns: [names], rows: [{label, values:[..]}])، "mind-map" (center, branches: [{label, children:[..]}])، "trace" (steps: [{line, explanation}])، "hierarchy" (root, children: [...]).',
    'اختر النوع الأنسب للمفهوم واملأ البيانات بشرح تعليمي عربي موجز.',
  ].join('\n\n');
  const result = await oneShot({ systemPrompt: system, userContent: `المفهوم: ${concept}\n\n${context ? `السياق:\n${context}` : ''}`, maxTokens: 1500 });
  if (!result.ok) return res.status(502).json({ error: result.error, fallback: true });

  const parsed = parseVisualJson(result.text);
  if (!parsed) return res.status(502).json({ error: 'تعذر تفسير التصور', fallback: true });
  res.json({ ...parsed, fallback: false });
});

function parseVisualJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch { /* ignore */ }
  }
  return null;
}

export default r;
