/**
 * ACE context collector — gathers bounded, intent-relevant raw candidates
 * from the SQLite database. Never loads the full history.
 */

import { all, get } from '../../db/index.js';
import { searchMemories } from '../memory.js';
import { getActiveSafePlan } from '../context-builder.js';
import { getSetting } from '../settings.js';
import { parseJson } from '../../lib/util.js';

const DAY = 86400000;

/**
 * @param {{ intent: string, message: string, now: Date, route: object, permissions?: object }} opts
 * @returns {import('../context/types.js').ContextItem[]}
 */
export function collectContext({ intent, message = '', now = new Date(), route, permissions = {} }) {
  const limits = route.limits || {};
  const domains = new Set(route.domains || []);
  const items = [];
  const perms = permissions; // { memories, tasks, journal, checkins, study, work, safe }

  const push = (source, rows, textFn) => {
    for (const r of rows) {
      const t = textFn(r);
      if (!t) continue;
      items.push({
        id: r.id != null ? String(r.id) : undefined,
        source,
        text: t,
        createdAt: r.created_at || r.entry_date || r.started_at || r.updated_at || r.exam_date || null,
        importance: r.importance != null ? Number(r.importance) : undefined,
        metadata: r,
      });
    }
  };

  /* ---- memories ---- */
  if (domains.has('memory') && perms.memories !== false) {
    const limit = limits.memories || 10;
    const mems = message && message.trim()
      ? searchMemories(message, { limit, aiAccess: true })
      : all(
          `SELECT id, content, importance, updated_at FROM memories
           WHERE archived = 0 AND ai_access = 1
           ORDER BY pinned DESC, importance DESC, updated_at DESC LIMIT ?`,
          limit,
        );
    push(
      'memory',
      mems,
      (m) => (m.content || '').slice(0, 300),
    );
  }

  /* ---- tasks ---- */
  if (domains.has('task') && perms.tasks !== false) {
    const rows = all(
      `SELECT id, title, priority, status, due_date, created_at, updated_at
       FROM tasks WHERE status NOT IN ('done','cancelled')
       ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC
       LIMIT ?`,
      limits.tasks || 12,
    );
    push('task', rows, (r) => {
      const parts = [r.title];
      if (r.priority === 'high') parts.push('مستعجلة');
      if (r.due_date) parts.push(`مستحقة ${r.due_date}`);
      return parts.join(' — ');
    });
  }

  /* ---- goals ---- */
  if (domains.has('goal') && perms.tasks !== false) {
    const rows = all(
      `SELECT id, title, life_area, progress, created_at FROM goals WHERE status = 'active'
       ORDER BY created_at DESC LIMIT ?`,
      limits.goals || 6,
    );
    push('goal', rows, (r) => `${r.title}${r.progress != null ? ` (تقدم ${Math.round(Number(r.progress) * 100)}%)` : ''}`);
  }

  /* ---- journal ---- */
  if (domains.has('journal') && perms.journal !== false) {
    const rows = all(
      `SELECT id, title, content, entry_date FROM journal_entries WHERE ai_access = 1
       ORDER BY entry_date DESC LIMIT ?`,
      limits.journal || 6,
    );
    push('journal', rows, (r) => `${r.title || 'بدون عنوان'}: ${(r.content || '').slice(0, 240)}`);
  }

  /* ---- checkins ---- */
  if (domains.has('checkin') && perms.checkins !== false) {
    const rows = all(
      `SELECT id, entry_date, energy, stress, sleep_hours, concern, success FROM checkins
       ORDER BY entry_date DESC LIMIT ?`,
      limits.checkins || 5,
    );
    push('checkin', rows, (r) => {
      const parts = [`تسجيل ${r.entry_date}`];
      if (r.energy) parts.push(`طاقة ${r.energy}`);
      if (r.stress) parts.push(`ضغط ${r.stress}`);
      if (r.concern) parts.push(`قلق: ${r.concern}`);
      return parts.join('، ');
    });
  }

  /* ---- study: courses + exams ---- */
  if (domains.has('study') && perms.study !== false) {
    const courses = all('SELECT id, name, code FROM courses ORDER BY created_at DESC LIMIT ?', limits.courses || 5);
    push('study', courses, (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`);

    const exams = all(
      `SELECT e.id, e.title, e.exam_date, c.name AS course_name
       FROM exams e JOIN courses c ON c.id = e.course_id
       ORDER BY CASE WHEN e.exam_date IS NULL THEN 1 ELSE 0 END, e.exam_date ASC
       LIMIT ?`,
      limits.exams || 6,
    );
    push('study', exams, (r) => `${r.title} (${r.course_name})${r.exam_date ? ` — ${r.exam_date}` : ''}`);
  }

  /* ---- work: notes + shifts ---- */
  if (domains.has('work') && perms.work !== false) {
    const notes = all('SELECT id, title, content, updated_at FROM work_notes ORDER BY updated_at DESC LIMIT ?', limits.notes || 6);
    push('work', notes, (r) => `${r.title}: ${(r.content || '').slice(0, 160)}`);

    const shifts = all('SELECT id, shift_start, shift_end, role FROM work_shifts ORDER BY shift_start DESC LIMIT ?', limits.shifts || 5);
    push('work', shifts, (r) => `مناوبة ${r.shift_start?.slice(0, 16)}${r.role ? ` — ${r.role}` : ''}`);
  }

  /* ---- focus sessions ---- */
  if (domains.has('focus') && perms.study !== false) {
    const rows = all(
      `SELECT id, minutes, started_at, completed FROM focus_sessions ORDER BY started_at DESC LIMIT ?`,
      limits.focus || 8,
    );
    push('focus', rows, (r) => `جلسة تركيز ${r.minutes} دقيقة${r.completed ? ' (مكتملة)' : ''} — ${r.started_at?.slice(0, 10)}`);
  }

  /* ---- safe living ---- */
  if (domains.has('safe_living') && perms.safe !== false) {
    const active = getActiveSafePlan();
    if (active) push('safe_living', [{ id: active.id, name: active.name, created_at: null }], (r) => `خطة نشطة: ${r.name}`);
    const plans = all(
      `SELECT id, name, created_at FROM safe_living_plans ORDER BY created_at DESC LIMIT ?`,
      limits.safe || 2,
    );
    push('safe_living', plans, (r) => `خطة: ${r.name}`);
  }

  /* ---- gratitude ---- */
  if (domains.has('gratitude') && perms.journal !== false) {
    const rows = all('SELECT id, entry_date, items FROM gratitude_entries ORDER BY entry_date DESC LIMIT ?', limits.gratitude || 5);
    push('gratitude', rows, (r) => {
      const list = Array.isArray(parseJson(r.items, [])) ? parseJson(r.items, []) : [];
      return `${r.entry_date}: ${list.slice(0, 3).join('، ')}`;
    });
  }

  /* ---- conversations ---- */
  if (domains.has('conversation')) {
    const rows = all(
      `SELECT c.id, c.title, c.updated_at FROM conversations c ORDER BY c.updated_at DESC LIMIT ?`,
      limits.conversations || 3,
    );
    push('conversation', rows, (r) => r.title);
  }

  /* ---- today's schedule ---- */
  if (domains.has('schedule')) {
    const today = now.toISOString().slice(0, 10);
    const rows = all(
      `SELECT id, title, start, category FROM calendar_events WHERE start LIKE ? ORDER BY start LIMIT ?`,
      `${today}%`,
      limits.schedule || 6,
    );
    push('schedule', rows, (r) => `${r.start?.slice(11, 16)} ${r.title}${r.category ? ` (${r.category})` : ''}`);
  }

  /* ---- profile ---- */
  if (domains.has('profile')) {
    const prefs = getSetting('userPreferences') || {};
    const name = getSetting('userName') || '';
    const text = [`اللغة: ${getSetting('language') === 'en' ? 'English' : 'العربية'}`];
    if (name) text.unshift(`اسم المستخدم: ${name}`);
    if (prefs.tone) text.push(`النبرة المفضلة: ${prefs.tone}`);
    if (prefs.responseLength) text.push(`طول الرد المفضل: ${prefs.responseLength}`);
    items.push({ source: 'profile', text: text.join('، '), score: 0, importance: 0.6 });
  }

  return items;
}
