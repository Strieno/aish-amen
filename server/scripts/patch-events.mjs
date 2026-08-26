import fs from 'node:fs';

// ---- data.js ----
let p = 'src/routes/data.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { harvestMemory } from '../services/memory.js';",
  "import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';",
);
// task complete
s = s.replace(
  `  if (done) {
    harvestMemory({ sourceType: 'task', sourceId: row.id, content: \`أنجزت مهمة: \${row.title}\`, importance: 0.45, tags: ['task'] });
  }`,
  `  if (done) {
    emitDomainEvent(EVENT_TYPES.TASK_COMPLETED, { entityType: 'task', entityId: row.id, title: row.title, summary: 'أنجز مهمة: ' + row.title });
  }`,
);
// milestone done
s = s.replace(
  `  if (b.done) {
    const goal = existing.goal_id ? get('SELECT title FROM goals WHERE id = ?', existing.goal_id) : null;
    harvestMemory({
      sourceType: 'milestone',
      sourceId: existing.id,
      content: \`أنجزت مرحلة: \${existing.title}\${goal ? \` — \${goal.title}\` : ''}\`,
      importance: 0.5,
      tags: ['goal'],
    });
  }`,
  `  if (b.done) {
    const goal = existing.goal_id ? get('SELECT title FROM goals WHERE id = ?', existing.goal_id) : null;
    emitDomainEvent(EVENT_TYPES.MILESTONE_COMPLETED, { entityType: 'milestone', entityId: existing.id, title: existing.title, goalTitle: goal?.title });
  }`,
);
// checkin
s = s.replace(
  `  if (parts.length) {
    harvestMemory({ sourceType: 'checkin', sourceId: req.params.date, content: \`تسجيل يوم \${req.params.date}: \${parts.join('، ')}\`, importance: 0.3, tags: ['checkin'] });
  }`,
  `  if (parts.length) {
    emitDomainEvent(EVENT_TYPES.CHECKIN_CREATED, { entityType: 'checkin', entityId: req.params.date, summary: 'تسجيل يوم ' + req.params.date + ': ' + parts.join('، ') });
  }`,
);
fs.writeFileSync(p, s);

// ---- study-work.js ----
p = 'src/routes/study-work.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { harvestMemory } from '../services/memory.js';",
  "import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';",
);
s = s.replace(
  `  if (b.grade != null) {
    const course = existing.course_id ? get('SELECT name FROM courses WHERE id = ?', existing.course_id) : null;
    harvestMemory({
      sourceType: 'exam',
      sourceId: existing.id,
      content: \`درجة \${b.title || existing.title}\${course ? \` (\${course.name})\` : ''}: \${b.grade}\`,
      importance: 0.55,
      tags: ['study'],
    });
  }`,
  `  if (b.grade != null) {
    const course = existing.course_id ? get('SELECT name FROM courses WHERE id = ?', existing.course_id) : null;
    emitDomainEvent(EVENT_TYPES.EXAM_GRADE_RECORDED, { entityType: 'exam', entityId: existing.id, title: b.title || existing.title, courseName: course?.name, grade: b.grade });
  }`,
);
fs.writeFileSync(p, s);

// ---- safe.js ----
p = 'src/routes/safe.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { harvestMemory } from '../services/memory.js';",
  "import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';",
);
s = s.replace(
  `  const plan = get('SELECT name FROM safe_living_plans WHERE id = ?', plan_id);
  if (plan) {
    harvestMemory({ sourceType: 'safe-plan', sourceId: id, content: \`فُعّلت خطة العيش الآمن: \${plan.name}\`, importance: 0.4, tags: ['safe'] });
  }`,
  `  const plan = get('SELECT name FROM safe_living_plans WHERE id = ?', plan_id);
  if (plan) {
    emitDomainEvent(EVENT_TYPES.SAFE_PLAN_ACTIVATED, { entityType: 'safe_living_plan', entityId: plan_id, title: plan.name, sessionId: id });
  }`,
);
fs.writeFileSync(p, s);

// ---- audio.js ----
p = 'src/routes/audio.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { harvestMemory } from '../services/memory.js';",
  "import { emitDomainEvent, EVENT_TYPES } from '../services/events.js';",
);
s = s.replace(
  `  const row = get('SELECT * FROM focus_sessions WHERE id = ?', req.params.id);
  if (row) {
    harvestMemory({ sourceType: 'focus', sourceId: row.id, content: \`جلسة تركيز \${row.minutes} دقيقة (\${row.started_at.slice(0, 10)})\`, importance: 0.25, tags: ['focus'] });
  }`,
  `  const row = get('SELECT * FROM focus_sessions WHERE id = ?', req.params.id);
  if (row) {
    emitDomainEvent(EVENT_TYPES.FOCUS_COMPLETED, { entityType: 'focus_session', entityId: row.id, minutes: row.minutes, date: row.started_at.slice(0, 10) });
  }`,
);
fs.writeFileSync(p, s);

console.log('route patches applied');
