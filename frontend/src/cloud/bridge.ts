import { cacheRows, getCachedRows, queueMutation } from './cache';
import { cloudConfigured, requireSupabase } from './client';
import { CloudRepository, type CloudRow } from './repository';
import { useCloudStore } from './store';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface CloudResult { handled: boolean; data?: unknown }

const repositories = new Map<string, CloudRepository>();
const repo = (table: string, prefix = '') => {
  const key = `${table}:${prefix}`;
  if (!repositories.has(key)) repositories.set(key, new CloudRepository(table, prefix));
  return repositories.get(key)!;
};

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const CLOUD_PROVIDERS = [
  {
    id: 'prov-deepseek-cloud', type: 'openai-compatible', name: 'DeepSeek Cloud',
    base_url: 'Vercel secure proxy', embedding_model: null, timeout_ms: 120000,
    is_primary: false, has_api_key: true,
  },
  {
    id: 'prov-openai-cloud', type: 'openai-compatible', name: 'OpenAI Cloud',
    base_url: 'Vercel secure proxy', embedding_model: null, timeout_ms: 120000,
    is_primary: false, has_api_key: true,
  },
];
const CLOUD_MODELS = [
  { id: 'am-deepseek-chat', provider_id: 'prov-deepseek-cloud', model_id: 'deepseek-chat', display_name: 'DeepSeek Chat', context_limit: null, capabilities: ['chat', 'stream'], last_seen: null },
  { id: 'am-deepseek-reasoner', provider_id: 'prov-deepseek-cloud', model_id: 'deepseek-reasoner', display_name: 'DeepSeek Reasoner', context_limit: null, capabilities: ['chat', 'stream', 'reasoning'], last_seen: null },
  { id: 'am-openai-gpt-5-6-luna', provider_id: 'prov-openai-cloud', model_id: 'gpt-5.6-luna', display_name: 'GPT-5.6 Luna', context_limit: null, capabilities: ['chat', 'stream', 'reasoning'], last_seen: null },
  { id: 'am-openai-gpt-5-6-terra', provider_id: 'prov-openai-cloud', model_id: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra', context_limit: null, capabilities: ['chat', 'stream', 'reasoning'], last_seen: null },
];
const asObject = (value: unknown) => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const stripUser = (row: Record<string, unknown>) => {
  const { user_id: _userId, ...rest } = row;
  return rest;
};

async function userId() {
  const { data } = await requireSupabase().auth.getSession();
  if (!data.session?.user) throw new Error('Authentication required');
  return data.session.user.id;
}

function networkFailure(error: unknown) {
  return !navigator.onLine || /fetch|network|offline|timeout/i.test(error instanceof Error ? error.message : String(error || ''));
}

async function getSettings() {
  const uid = await userId();
  try {
    const { data, error } = await requireSupabase().from('user_settings').select('*').eq('user_id', uid);
    if (error) throw error;
    await cacheRows(uid, 'user_settings', data || []);
    return Object.fromEntries((data || []).map((row) => [row.key, row.value]));
  } catch (error) {
    if (!networkFailure(error)) throw error;
    useCloudStore.getState().setStatus('offline');
    return Object.fromEntries((await getCachedRows(uid, 'user_settings')).map((row) => [String(row.key), row.value]));
  }
}

async function saveSettings(input: Record<string, unknown>) {
  const uid = await userId();
  const rows = Object.entries(input).map(([key, value]) => ({ user_id: uid, key, value, updated_at: now() }));
  await cacheRows(uid, 'user_settings', rows);
  try {
    const { error } = await requireSupabase().from('user_settings').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw error;
    useCloudStore.getState().markSynced();
  } catch (error) {
    if (!networkFailure(error)) throw error;
    for (const row of rows) {
      await queueMutation({
        key: `${uid}:user_settings:${row.key}`,
        userId: uid,
        table: 'user_settings',
        recordId: row.key,
        operation: 'upsert',
        row,
        idColumn: 'key',
        conflict: 'user_id,key',
        queuedAt: now(),
      });
    }
    useCloudStore.getState().setStatus('offline', 'حُفظت الإعدادات وستُزامن لاحقًا');
  }
  return { ok: true };
}

function filterText(rows: CloudRow[], query: string, fields: string[]) {
  const value = query.trim().toLocaleLowerCase('ar');
  if (!value) return rows;
  return rows.filter((row) => fields.some((field) => String(row[field] || '').toLocaleLowerCase('ar').includes(value)));
}

async function tasks(url: URL) {
  let rows = await repo('tasks', 'task-').list({}, { order: 'created_at', ascending: false });
  for (const key of ['status', 'energy', 'priority'] as const) {
    const value = url.searchParams.get(key);
    if (value) rows = rows.filter((row) => row[key] === value);
  }
  const project = url.searchParams.get('project');
  const course = url.searchParams.get('course');
  if (project) rows = rows.filter((row) => row.project_id === project);
  if (course) rows = rows.filter((row) => row.course_id === course);
  rows = filterText(rows, url.searchParams.get('q') || '', ['title', 'description', 'notes']);
  const [projects, courses] = await Promise.all([repo('projects').list(), repo('courses').list()]);
  const projectNames = new Map(projects.map((row) => [row.id, row.name]));
  const courseNames = new Map(courses.map((row) => [row.id, row.name]));
  return rows.map((row) => ({ ...row, project_name: projectNames.get(String(row.project_id || '')), course_name: courseNames.get(String(row.course_id || '')), completed: row.status === 'done' }));
}

async function goals() {
  const [rows, milestones, projects] = await Promise.all([repo('goals', 'goal-').list(), repo('goal_milestones', 'ms-').list(), repo('projects').list()]);
  return rows.map((goal) => {
    const own = milestones.filter((item) => item.goal_id === goal.id).sort((a, b) => String(a.due_date || a.created_at).localeCompare(String(b.due_date || b.created_at)));
    return { ...goal, progress: Number(goal.progress || 0), milestones: own, milestones_done: own.filter((item) => item.done).length, milestones_total: own.length, projects: projects.filter((item) => item.goal_id === goal.id).length };
  });
}

async function courses() {
  const [rows, topics, taskRows, exams] = await Promise.all([repo('courses', 'course-').list(), repo('course_topics', 'topic-').list(), repo('tasks').list(), repo('exams', 'exam-').list()]);
  return rows.map((course) => ({
    ...course,
    topics_count: topics.filter((item) => item.course_id === course.id).length,
    topics_done: topics.filter((item) => item.course_id === course.id && item.done).length,
    open_tasks: taskRows.filter((item) => item.course_id === course.id && !['done', 'cancelled'].includes(String(item.status))).length,
    upcoming_exams: exams.filter((item) => item.course_id === course.id && String(item.exam_date || '') >= today()).length,
  }));
}

async function cloudCourseDetail(courseId: string) {
  const course = await repo('courses').get(courseId);
  if (!course) return null;
  const [topics, exams, taskRows] = await Promise.all([
    repo('course_topics').list({ course_id: courseId }),
    repo('exams').list({ course_id: courseId }),
    repo('tasks').list({ course_id: courseId }),
  ]);
  const mastery = topics.map((topic) => Number(topic.mastery || 0));
  return {
    ...course,
    mastery_avg: mastery.length ? Math.round(mastery.reduce((sum, score) => sum + score, 0) / mastery.length) : 0,
    mastered_count: mastery.filter((score) => score >= 85).length,
    weak_count: mastery.filter((score) => score > 0 && score < 45).length,
    topics_count: topics.length,
    topics_done: topics.filter((topic) => Boolean(topic.done)).length,
    topics,
    exams,
    tasks: taskRows,
    // Advanced study tables are local-only in the current cloud schema. Keep
    // the API contract stable so partial cloud data never crashes the page.
    notes: [],
    flashcards: [],
    sessions: [],
    mistakes: [],
  };
}

async function cloudSurprise() {
  const day = today();
  const [taskRows, checkins, journals, focusRows, topics] = await Promise.all([
    repo('tasks').list(),
    repo('checkins').list({ entry_date: day }),
    repo('journal_entries').list({ entry_date: day }),
    repo('focus_sessions').list(),
    repo('course_topics').list(),
  ]);
  const openTasks = taskRows.filter((task) => !['done', 'cancelled'].includes(String(task.status)));
  const doneToday = taskRows.filter((task) => task.status === 'done' && String(task.completed_at || '').startsWith(day)).length;
  const focusToday = focusRows
    .filter((row) => Boolean(row.completed) && String(row.started_at || '').startsWith(day))
    .reduce((sum, row) => sum + Number(row.minutes || 0), 0);

  if (!journals.length) return { type: 'reflection', title: 'سؤال تأمل', text: 'ما أصغر شيء أنجزته اليوم ويمكنك أن تقدّر نفسك عليه؟', action: { route: '/journal' }, actionLabel: 'اكتب يوميتك' };
  if (!checkins.length) return { type: 'checkin', title: 'نبض اليوم', text: 'لم تسجّل حالتك اليوم بعد — نصف دقيقة تساعد التطبيق على فهم يومك.', action: { route: '/safe' }, actionLabel: 'سجّل الآن' };
  const unfinishedTopic = topics.find((topic) => !topic.done);
  if (unfinishedTopic && focusToday < 25) return { type: 'challenge', title: 'تحدٍّ صغير', text: `راجع «${unfinishedTopic.title}» لخمس دقائق، ثم اشرح الفكرة بجملة واحدة من ذاكرتك.`, action: { route: '/study' }, actionLabel: 'افتح الدراسة' };
  if (doneToday === 0 && openTasks.length) return { type: 'challenge', title: 'مهمة وحيدة', text: `لديك ${openTasks.length} مهمة مفتوحة. اختر أقصر واحدة وأنهِ خطوتها الأولى الآن.`, action: { route: '/tasks' }, actionLabel: 'افتح المهام' };
  const ideas = [
    'اكتب أهم فكرة تعلمتها اليوم في سطر واحد؛ التلخيص القصير يثبتها أكثر.',
    'اختر شيئًا مؤجلًا ونفّذ منه دقيقتين فقط. البداية الصغيرة تحسب.',
    'خذ دقيقة تنفس هادئة، ثم عد إلى أهم شيء واحد فقط.',
  ];
  return { type: new Date().getHours() >= 22 ? 'calm' : 'idea', title: new Date().getHours() >= 22 ? 'وقت الهدوء' : 'فكرة اليوم', text: ideas[Math.floor(Math.random() * ideas.length)], action: null, actionLabel: null };
}

async function cloudStudyAnalytics(days = 14) {
  const rangeDays = Math.min(60, Math.max(7, Math.round(days) || 14));
  const [focusRows, activityRows, taskRows, courseRows, topics] = await Promise.all([
    repo('focus_sessions').list({}, { order: 'started_at', ascending: false }),
    repo('activity_events').list({}, { order: 'ts', ascending: false }),
    repo('tasks').list(),
    repo('courses').list(),
    repo('course_topics').list(),
  ]);
  const studyRows = activityRows
    .filter((row) => row.event_type === 'StudySession')
    .map((row) => {
      const metadata = asObject(row.metadata);
      return {
        id: row.id,
        started_at: row.ts,
        minutes: Number(metadata.minutes || 0),
        course_id: metadata.course_id || null,
        topic_id: metadata.topic_id || null,
        completed: true,
      };
    });
  const completed = [...focusRows.filter((row) => Boolean(row.completed)), ...studyRows];
  const taskById = new Map(taskRows.map((row) => [String(row.id), row]));
  const courseById = new Map(courseRows.map((row) => [String(row.id), row]));
  const courseName = (courseId: string) => String(courseById.get(courseId)?.name || 'بدون مادة');
  const rowCourseId = (row: CloudRow) => String(row.course_id || taskById.get(String(row.task_id || ''))?.course_id || '');
  const dateSeries = (count: number) => Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.now() - (count - index - 1) * 86400000).toISOString().slice(0, 10);
    return date;
  });
  const minutesOn = (date: string) => completed
    .filter((row) => String(row.started_at || '').startsWith(date))
    .reduce((sum, row) => sum + Number(row.minutes || 0), 0);
  const distribution = new Map<string, number>();
  const from30 = Date.now() - 30 * 86400000;
  for (const row of completed) {
    if (new Date(String(row.started_at || 0)).getTime() < from30) continue;
    const courseId = rowCourseId(row);
    distribution.set(courseId, (distribution.get(courseId) || 0) + Number(row.minutes || 0));
  }
  const heatmap = dateSeries(35).map((date) => {
    const byCourse = new Map<string, number>();
    for (const row of completed.filter((item) => String(item.started_at || '').startsWith(date))) {
      const courseId = rowCourseId(row);
      byCourse.set(courseId, (byCourse.get(courseId) || 0) + Number(row.minutes || 0));
    }
    const courses = [...byCourse.entries()].map(([courseId, minutes]) => ({ course: courseName(courseId), minutes }));
    return { date, total: courses.reduce((sum, item) => sum + item.minutes, 0), courses };
  });
  const topicRows = topics.map((topic) => ({
    id: String(topic.id),
    title: String(topic.title || 'موضوع'),
    mastery: topic.done ? 100 : 0,
    course_name: courseName(String(topic.course_id || '')),
  }));
  const recent = dateSeries(rangeDays);
  const weekly = dateSeries(Math.min(14, rangeDays)).map((date) => ({ date, minutes: minutesOn(date) }));
  const emptyTrend = recent.map((date) => ({ date, accuracy: null, attempts: 0 }));
  const masteryTrend = recent.map((date) => ({ date, avg: null, topics: 0 }));
  const activeDays = dateSeries(30).filter((date) => minutesOn(date) > 0).length;
  const recentSessions = completed.filter((row) => new Date(String(row.started_at || 0)).getTime() >= from30);
  return {
    weekly,
    subjectDistribution: [...distribution.entries()]
      .map(([courseId, minutes]) => ({ courseId, courseName: courseName(courseId), minutes: Math.round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes),
    accuracyTrend: emptyTrend,
    masteryTrend,
    heatmap,
    weak: [],
    strong: topicRows.filter((topic) => topic.mastery >= 65).slice(0, 5),
    consistency: activeDays,
    totalTopics: topicRows.length,
    masteredTopics: topicRows.filter((topic) => topic.mastery >= 85).length,
    focusAvg: recentSessions.length ? recentSessions.reduce((sum, row) => sum + Number(row.minutes || 0), 0) / recentSessions.length : 0,
    mistakesAnalysis: null,
  };
}

async function saveCloudStudySession(input: Record<string, unknown>) {
  const minutes = Math.min(600, Math.max(1, Number(input.minutes || 0)));
  const timestamp = now();
  const row = await repo('activity_events', 'study-session-').create({
    event_type: 'StudySession',
    entity_type: 'study_session',
    entity_id: input.topic_id || input.course_id || null,
    ts: timestamp,
    summary: `جلسة دراسة ${minutes} دقيقة`,
    metadata: {
      course_id: input.course_id || null,
      topic_id: input.topic_id || null,
      minutes,
      type: input.type || 'study',
      difficulty_felt: input.difficulty_felt || null,
      understanding: input.understanding ?? null,
    },
  });
  return {
    id: row.id,
    course_id: input.course_id || null,
    topic_id: input.topic_id || null,
    started_at: timestamp,
    ended_at: timestamp,
    minutes,
    type: input.type || 'study',
    difficulty_felt: input.difficulty_felt || null,
    understanding: input.understanding ?? null,
  };
}

async function dashboard() {
  const [taskRows, schedule, checkins, focus, goalRows, examRows, courseRows, links, suggestions, conversations, journals] = await Promise.all([
    repo('tasks').list(), repo('calendar_events').list(), repo('checkins').list(), repo('focus_sessions').list(),
    repo('goals').list(), repo('exams').list(), repo('courses').list(), repo('entity_links').list(),
    repo('link_suggestions').list(), repo('conversations').list(), repo('journal_entries').list(),
  ]);
  const day = today();
  const open = taskRows.filter((item) => !['done', 'cancelled'].includes(String(item.status)));
  const dayTasks = open.filter((item) => !item.due_date || item.due_date === day);
  const daySchedule = schedule.filter((item) => String(item.start).startsWith(day)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const checkin = checkins.find((item) => item.entry_date === day) || null;
  let load = 0;
  if (Number(checkin?.stress || 0) >= 4) load += 2;
  if (checkin && Number(checkin.energy || 5) <= 2) load += 2;
  const high = dayTasks.filter((item) => item.priority === 'high').length;
  load += high >= 3 ? 2 : high ? 1 : 0;
  if (open.length >= 12) load += 1;
  if (daySchedule.length >= 6) load += 1;
  const level = load >= 4 ? 'overloaded' : load >= 2 ? 'slightly-overloaded' : 'stable';
  const courseNames = new Map(courseRows.map((item) => [item.id, item.name]));
  const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const last = <T extends CloudRow>(rows: T[]) => [...rows].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0] || null;
  return {
    today: day,
    now: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
    tasks: dayTasks,
    schedule: daySchedule,
    checkin,
    stats: {
      doneToday: taskRows.filter((item) => item.status === 'done' && String(item.completed_at || '').startsWith(day)).length,
      focusMinutesToday: focus.filter((item) => item.completed && String(item.started_at).startsWith(day)).reduce((sum, item) => sum + Number(item.minutes || 0), 0),
      openTotal: open.length,
    },
    safe: { level, load },
    nextEvent: daySchedule[0] ? { title: daySchedule[0].title, start: daySchedule[0].start } : null,
    intelligence: {
      study: { exams: examRows.filter((item) => String(item.exam_date || '') >= day && String(item.exam_date || '') <= soon).slice(0, 3).map((item) => ({ ...item, course: courseNames.get(String(item.course_id || '')) || '' })), courses: courseRows.slice(0, 3) },
      goals: goalRows.filter((item) => item.status === 'active').slice(0, 4),
      connections: links.slice(0, 5),
      resume: { conversation: last(conversations), task: last(open), journal: last(journals) },
      pendingLinks: suggestions.filter((item) => item.status === 'pending').slice(0, 4),
    },
  };
}

async function safeStatus() {
  const [checkins, taskRows] = await Promise.all([repo('checkins').list(), repo('tasks').list()]);
  const checkin = checkins.find((item) => item.entry_date === today());
  let score = 0;
  if (Number(checkin?.stress || 0) >= 4) score += 2;
  if (checkin && Number(checkin.energy || 5) <= 2) score += 2;
  if (taskRows.filter((item) => !['done', 'cancelled'].includes(String(item.status))).length >= 12) score += 1;
  return { level: score >= 4 ? 'overloaded' : score >= 2 ? 'slightly-overloaded' : 'stable', factors: { score } };
}

async function cloudExport() {
  const uid = await userId();
  const tables = ['profiles','user_settings','ai_provider_profiles','ai_models','assistants','conversation_folders','conversations','messages','memories','memory_tags','tasks','projects','goals','goal_milestones','journal_entries','journal_attachments','gratitude_entries','calendar_events','checkins','courses','course_topics','exams','work_shifts','work_notes','knowledge_bases','documents','document_chunks','audio_files','audio_presets','sound_scenes','focus_sessions','safe_living_plans','safe_living_sessions','automation_rules','notifications','entity_links','link_suggestions','activity_events'];
  const entries = await Promise.all(tables.map(async (table) => {
    const { data, error } = await requireSupabase().from(table).select('*').eq('user_id', uid);
    if (error) throw error;
    return [table, (data || []).map(stripUser)] as const;
  }));
  return { app: 'aish-aman', version: 'cloud-1', exportedAt: now(), data: Object.fromEntries(entries) };
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function audioRows() {
  const rows = await repo('audio_files', 'audio-').list({}, { order: 'created_at', ascending: false });
  return Promise.all(rows.map(async (row) => {
    const { data } = await requireSupabase().storage.from('aishaman-private').createSignedUrl(String(row.path), 3600);
    return { ...row, url: data?.signedUrl || '' };
  }));
}

async function importAudio(input: Record<string, unknown>) {
  if (!navigator.onLine) throw new Error('يلزم اتصال بالإنترنت لرفع ملف صوتي جديد.');
  const uid = await userId();
  const id = repo('audio_files', 'audio-').createId();
  const filename = String(input.filename || 'audio.bin').replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const path = `${uid}/audio/${id}/${filename}`;
  const blob = dataUrlToBlob(String(input.data || ''));
  const { error } = await requireSupabase().storage.from('aishaman-private').upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return repo('audio_files').create({ id, title: input.title || filename, path, category: input.category || 'sound', tags: [], favorite: false, volume: 0.8, loop_enabled: false });
}

async function knowledgeList() {
  const [bases, documents, chunks] = await Promise.all([repo('knowledge_bases', 'kb-').list(), repo('documents', 'doc-').list(), repo('document_chunks', 'chunk-').list()]);
  return bases.map((base) => ({ ...base, documents: documents.filter((item) => item.kb_id === base.id).map((document) => ({ ...document, chunks: chunks.filter((chunk) => chunk.document_id === document.id).length })) }));
}

async function importKnowledge(input: Record<string, unknown>) {
  const content = String(input.content || '');
  const document = await repo('documents', 'doc-').create({ kb_id: input.kb_id, filename: input.filename, path: `cloud://${String(input.filename || '')}`, hash: await cryptoHash(content), status: 'ready' });
  const pieces = content.match(/[\s\S]{1,1200}/g) || [];
  for (let index = 0; index < pieces.length; index += 1) await repo('document_chunks', 'chunk-').create({ document_id: document.id, content: pieces[index], chunk_index: index });
  return { ...document, chunks: pieces.length };
}

async function cryptoHash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function insights() {
  const [focus, taskRows, checkins] = await Promise.all([repo('focus_sessions').list(), repo('tasks').list(), repo('checkins').list()]);
  const completeFocus = focus.filter((item) => item.completed);
  return {
    avgFocusMinutes: completeFocus.length ? Math.round(completeFocus.reduce((sum, item) => sum + Number(item.minutes || 0), 0) / completeFocus.length) : 0,
    tasksCompleted: taskRows.filter((item) => item.status === 'done').length,
    studyMinutesToday: completeFocus.filter((item) => String(item.started_at).startsWith(today())).reduce((sum, item) => sum + Number(item.minutes || 0), 0),
    postponedTasks: taskRows.filter((item) => item.due_date && String(item.due_date) < today() && item.status !== 'done').slice(0, 8),
    productiveHour: null,
    sleepStudy: checkins.slice(0, 14).map((item) => ({ sleep: item.sleep_hours || null, sessions: focus.filter((focusRow) => String(focusRow.started_at).startsWith(String(item.entry_date))).length })),
  };
}

async function cloudTimeline(url: URL) {
  const days = Number(url.searchParams.get('days') || 30);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const [events, taskRows, journals, goalRows, focusRows, checkins, memories] = await Promise.all([
    repo('activity_events').list(), repo('tasks').list(), repo('journal_entries').list(), repo('goals').list(),
    repo('focus_sessions').list(), repo('checkins').list(), repo('memories').list(),
  ]);
  const synthetic = [
    ...taskRows.map((row) => ({ id: `task:${row.id}`, event_type: 'TaskUpdated', entity_type: 'task', entity_id: row.id, ts: row.updated_at || row.created_at, summary: String(row.title || 'مهمة'), metadata: {} })),
    ...journals.map((row) => ({ id: `journal:${row.id}`, event_type: 'JournalUpdated', entity_type: 'journal', entity_id: row.id, ts: row.updated_at || row.created_at, summary: String(row.title || 'يوميات'), metadata: {} })),
    ...goalRows.map((row) => ({ id: `goal:${row.id}`, event_type: 'GoalUpdated', entity_type: 'goal', entity_id: row.id, ts: row.updated_at || row.created_at, summary: String(row.title || 'هدف'), metadata: {} })),
    ...focusRows.map((row) => ({ id: `focus:${row.id}`, event_type: 'FocusSession', entity_type: 'focus', entity_id: row.id, ts: row.ended_at || row.started_at, summary: `جلسة تركيز ${row.minutes || 0} دقيقة`, metadata: {} })),
    ...checkins.map((row) => ({ id: `checkin:${row.id}`, event_type: 'CheckinUpdated', entity_type: 'checkin', entity_id: row.id, ts: row.updated_at || row.created_at, summary: `تسجيل يوم ${row.entry_date}`, metadata: {} })),
    ...memories.map((row) => ({ id: `memory:${row.id}`, event_type: 'MemoryUpdated', entity_type: 'memory', entity_id: row.id, ts: row.updated_at || row.created_at, summary: String(row.content || '').slice(0, 100), metadata: {} })),
  ];
  const domains = (url.searchParams.get('domains') || '').split(',').filter(Boolean);
  const combined = [...events, ...synthetic] as CloudRow[];
  return combined
    .filter((row) => String(row.ts || row.created_at || '') >= cutoff)
    .filter((row) => !domains.length || domains.includes(String(row.entity_type || '')))
    .sort((a, b) => String(b.ts || b.created_at).localeCompare(String(a.ts || a.created_at)))
    .slice(0, Number(url.searchParams.get('limit') || 200));
}

async function universalSearch(url: URL) {
  const q = url.searchParams.get('q') || '';
  const limit = Number(url.searchParams.get('per_group') || 5);
  const specs = [
    ['task', 'المهام', 'tasks', ['title', 'description']],
    ['goal', 'الأهداف', 'goals', ['title', 'notes']],
    ['journal', 'اليوميات', 'journal_entries', ['title', 'content']],
    ['memory', 'الذاكرة', 'memories', ['content', 'source']],
    ['course', 'الدراسة', 'courses', ['name', 'code']],
    ['work_note', 'العمل', 'work_notes', ['title', 'content']],
    ['conversation', 'المحادثات', 'conversations', ['title']],
    ['knowledge', 'المعرفة', 'knowledge_bases', ['name', 'description']],
  ] as const;
  const groups = await Promise.all(specs.map(async ([type, label, table, fields]) => {
    const rows = filterText(await repo(table).list(), q, [...fields]).slice(0, limit);
    return {
      type,
      label,
      items: rows.map((row) => ({ id: String(row.id), title: String(row.title || row.name || row.content || row.id).slice(0, 120), sub: String(row.description || row.notes || row.source || '').slice(0, 120) || undefined })),
    };
  }));
  const visible = groups.filter((group) => group.items.length);
  return { groups: visible, total: visible.reduce((sum, group) => sum + group.items.length, 0) };
}

async function graphData(url: URL) {
  const links = await repo('entity_links').list();
  const types = (url.searchParams.get('types') || '').split(',').filter(Boolean);
  const filtered = links.filter((row) => !types.length || types.includes(String(row.source_type)) || types.includes(String(row.target_type)));
  const nodeMap = new Map<string, { id: string; type: string; entityId: string; title: string }>();
  for (const row of filtered) {
    const source = `${row.source_type}:${row.source_id}`;
    const target = `${row.target_type}:${row.target_id}`;
    nodeMap.set(source, { id: source, type: String(row.source_type), entityId: String(row.source_id), title: String(row.source_title || row.source_id) });
    nodeMap.set(target, { id: target, type: String(row.target_type), entityId: String(row.target_id), title: String(row.target_title || row.target_id) });
  }
  return {
    nodes: [...nodeMap.values()],
    edges: filtered.map((row) => ({ id: String(row.id), source: `${row.source_type}:${row.source_id}`, target: `${row.target_type}:${row.target_id}`, relationship: String(row.relationship_type || 'related_to'), confidence: Number(row.confidence || 1), created_by: row.created_by })),
    center: url.searchParams.get('entity_type') && url.searchParams.get('entity_id') ? `${url.searchParams.get('entity_type')}:${url.searchParams.get('entity_id')}` : null,
  };
}

async function smartContext(url: URL) {
  const page = url.searchParams.get('page') || 'today';
  const [taskRows, memories, goals, conversations, activity, suggestions] = await Promise.all([
    repo('tasks').list(), repo('memories').list(), repo('goals').list(), repo('conversations').list(), repo('activity_events').list(), repo('link_suggestions').list(),
  ]);
  const preview = (rows: CloudRow[], title: (row: CloudRow) => unknown, sub?: (row: CloudRow) => unknown) => rows.slice(0, 6).map((row) => ({ id: String(row.id), title: String(title(row) || ''), sub: sub ? String(sub(row) || '') : undefined }));
  return {
    page,
    focus: null,
    related: [],
    memories: preview(memories.filter((row) => !row.archived), (row) => row.content, (row) => row.source),
    tasks: preview(taskRows.filter((row) => !['done', 'cancelled'].includes(String(row.status))), (row) => row.title, (row) => row.due_date),
    goals: preview(goals.filter((row) => row.status === 'active'), (row) => row.title, (row) => `${Math.round(Number(row.progress || 0) * 100)}%`),
    deadlines: preview(taskRows.filter((row) => row.due_date), (row) => row.title, (row) => row.due_date).map((row) => ({ ...row, type: 'task' })),
    conversations: preview(conversations, (row) => row.title, (row) => row.updated_at),
    activity: preview(activity, (row) => row.summary, (row) => row.ts),
    linkSuggestions: preview(suggestions.filter((row) => row.status === 'pending'), (row) => row.reason || `${row.source_type} ↔ ${row.target_type}`, (row) => `${Math.round(Number(row.confidence || 0) * 100)}%`),
  };
}


function recentEnough(row: CloudRow, cutoff: string) {
  const stamp = String(row.updated_at || row.created_at || row.entry_date || row.started_at || row.activated_at || '');
  return Boolean(stamp && stamp >= cutoff);
}

async function harvestCloudMemories(days = 7) {
  const settings = await getSettings();
  const ai = asObject(settings.ai);
  const permissions = asObject(ai.permissions);
  const read = asObject(permissions.read);
  const write = asObject(permissions.write);
  if (write.memories === false) return { ok: false, added: 0, error: 'الكتابة إلى الذاكرة غير مسموحة' };
  const canRead = (key: string) => read[key] !== false;
  const cutoff = new Date(Date.now() - Math.max(1, Math.min(90, days)) * 86400000).toISOString().slice(0, 10);

  const [existing, journals, taskRows, checkins, focus, goalRows, exams, workNotes, safeSessions, safePlans] = await Promise.all([
    repo('memories').list(),
    canRead('journal') ? repo('journal_entries').list() : Promise.resolve([]),
    canRead('tasks') ? repo('tasks').list() : Promise.resolve([]),
    canRead('checkins') ? repo('checkins').list() : Promise.resolve([]),
    repo('focus_sessions').list(),
    canRead('goals') ? repo('goals').list() : Promise.resolve([]),
    canRead('study') ? repo('exams').list() : Promise.resolve([]),
    canRead('work') ? repo('work_notes').list() : Promise.resolve([]),
    canRead('safe') ? repo('safe_living_sessions').list() : Promise.resolve([]),
    canRead('safe') ? repo('safe_living_plans').list() : Promise.resolve([]),
  ]);

  const seen = new Set(existing.map((row) => `${row.source_type || ''}:${row.source_id || ''}`));
  const candidates: Array<{ sourceType: string; sourceId: string; type: string; content: string; importance?: number }> = [];
  const add = (sourceType: string, row: CloudRow, type: string, content: string, importance = 0.55) => {
    const id = String(row.id || '');
    const clean = content.replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!id || !clean || !recentEnough(row, cutoff) || seen.has(`${sourceType}:${id}`)) return;
    candidates.push({ sourceType, sourceId: id, type, content: clean, importance });
    seen.add(`${sourceType}:${id}`);
  };

  for (const row of journals.filter((item) => item.ai_access !== false)) {
    add('journal', row, 'event', `يوميات ${row.entry_date || ''}: ${String(row.title || '').trim()} ${String(row.content || '').trim()}`, 0.58);
  }
  for (const row of taskRows) {
    const status = row.status === 'done' ? 'اكتملت' : `حالها ${row.status || 'inbox'}`;
    add('task', row, 'goal', `مهمة «${row.title || ''}» ${status}${row.due_date ? `، استحقاقها ${row.due_date}` : ''}.`, row.status === 'done' ? 0.62 : 0.5);
  }
  for (const row of checkins) {
    add('checkin', row, 'habit', `تسجيل ${row.entry_date || ''}: طاقة ${row.energy ?? '—'}، ضغط ${row.stress ?? '—'}، نوم ${row.sleep_hours ?? '—'} ساعة. ${row.success ? `نجاح: ${row.success}. ` : ''}${row.concern ? `اهتمام: ${row.concern}.` : ''}`, 0.5);
  }
  for (const row of focus.filter((item) => item.completed)) {
    add('focus', row, 'habit', `أكمل جلسة تركيز لمدة ${row.minutes || 0} دقيقة بتاريخ ${String(row.started_at || '').slice(0, 10)}.`, 0.48);
  }
  for (const row of goalRows) {
    add('goal', row, 'goal', `هدف «${row.title || ''}» — الحالة ${row.status || 'active'}، التقدم ${Math.round(Number(row.progress || 0) * 100)}%${row.target_date ? `، التاريخ المستهدف ${row.target_date}` : ''}.`, 0.65);
  }
  for (const row of exams) {
    add('exam', row, 'study', `اختبار «${row.title || ''}»${row.exam_date ? ` بتاريخ ${row.exam_date}` : ''}${row.grade != null ? `، الدرجة ${row.grade}` : ''}.`, 0.62);
  }
  for (const row of workNotes) {
    add('work', row, 'work', `ملاحظة عمل «${row.title || ''}»: ${row.content || ''}`, 0.58);
  }
  const planNames = new Map(safePlans.map((row) => [String(row.id), String(row.name || 'خطة عيش آمن')]));
  for (const row of safeSessions) {
    add('safe', row, 'habit', `جلسة عيش آمن: ${planNames.get(String(row.plan_id || '')) || 'خطة'} — الحالة ${row.status || 'active'} بتاريخ ${String(row.activated_at || '').slice(0, 10)}.`, 0.66);
  }

  let added = 0;
  for (const item of candidates.slice(0, 80)) {
    await repo('memories', 'mem-').create({
      content: item.content,
      type: item.type,
      importance: item.importance ?? 0.55,
      source: 'harvest',
      source_type: item.sourceType,
      source_id: item.sourceId,
      confidence: 0.95,
      tags: ['harvest'],
      pinned: false,
      archived: false,
      ai_access: true,
    });
    added += 1;
  }
  return { ok: true, added };
}

function parseMarkdownChatCloud(raw: string) {
  const lines = String(raw || '').split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() || 'محادثة مستوردة';
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(user|assistant|المستخدم|المساعد|أنا)(?:\*\*)?\s*[:：-]\s*(.*)$/i);
    if (match) {
      const role: 'user' | 'assistant' = /user|المستخدم|أنا/i.test(match[1]) ? 'user' : 'assistant';
      messages.push({ role, content: match[2].trim() });
    } else if (!line.startsWith('#') && messages.length) {
      messages[messages.length - 1].content += `\n${line}`;
    }
  }
  return [{ title, messages }];
}

async function importCloudConversations(input: Record<string, unknown>) {
  const raw = input.content ?? input.data;
  let items: any[] = [];
  if (input.format === 'markdown' || (typeof raw === 'string' && !raw.trim().startsWith('[') && !raw.trim().startsWith('{'))) {
    items = parseMarkdownChatCloud(String(raw || ''));
  } else {
    let data: any = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch { return { ok: false, imported: 0, error: 'invalid JSON' }; }
    }
    if (data?.type === 'conversation' && data.conversation && Array.isArray(data.messages)) {
      items = [{ title: data.conversation.title, folder: data.conversation.folder, tags: data.conversation.tags, messages: data.messages }];
    } else if (Array.isArray(data)) {
      items = data;
    } else if (data && Array.isArray(data.messages)) {
      items = [data];
    } else {
      return { ok: false, imported: 0, error: 'unrecognized import format' };
    }
  }

  const ids: string[] = [];
  for (const item of items.slice(0, 100)) {
    if (!item || !Array.isArray(item.messages)) continue;
    const conversation = await repo('conversations', 'conv-').create({
      title: String(item.title || 'محادثة مستوردة').slice(0, 120),
      assistant_id: null,
      provider_id: CLOUD_PROVIDERS[0].id,
      model: CLOUD_MODELS[0].model_id,
      folder: item.folder || null,
      pinned: false,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 20) : [],
      context: [],
      mode: 'general',
    });
    for (const message of item.messages.slice(0, 500)) {
      if (!message || !['user', 'assistant'].includes(message.role)) continue;
      await repo('messages', 'msg-').create({
        conversation_id: conversation.id,
        role: message.role,
        content: String(message.content || '').slice(0, 20000),
        model: message.role === 'assistant' ? (message.model || null) : null,
        provider: message.role === 'assistant' ? (message.provider || null) : null,
        created_at: message.created_at || now(),
      });
    }
    ids.push(String(conversation.id));
  }
  return { ok: true, imported: ids.length, ids };
}


async function executeCloudProposal(proposal: Record<string, any>) {
  const settings = await getSettings();
  const write = (settings.ai as any)?.permissions?.write || {};
  const allowed = (key: string) => write[key] !== false;
  const d = (proposal.data && typeof proposal.data === 'object' ? proposal.data : {}) as Record<string, any>;
  const title = String(d.title || proposal.title || '').trim();

  switch (proposal.type) {
    case 'task': {
      if (!allowed('tasks')) return { ok: false, error: 'الكتابة إلى المهام غير مسموحة' };
      const row = await repo('tasks', 'task-').create({ title: title || 'مهمة', description: d.description || '', priority: d.priority || 'medium', energy: d.energy || 'medium', est_minutes: d.est_minutes ?? d.minutes ?? null, due_date: d.due_date || null, project_id: null, course_id: null, tags: [], status: 'inbox', dependencies: [], notes: d.notes || '' });
      return { ok: true, entity: { type: 'task', id: row.id, title: row.title } };
    }
    case 'focus': {
      const row = await repo('focus_sessions', 'focus-').create({ started_at: now(), ended_at: now(), minutes: Number(d.minutes || 25), task_id: d.task_id || null, completed: true });
      return { ok: true, entity: { type: 'focus_session', id: row.id, title: `${row.minutes} دقيقة` } };
    }
    case 'goal': {
      if (!allowed('goals')) return { ok: false, error: 'الكتابة إلى الأهداف غير مسموحة' };
      const row = await repo('goals', 'goal-').create({ title: title || 'هدف', life_area: d.life_area || null, target_date: d.target_date || null, status: 'active', progress: 0, notes: d.notes || '' });
      return { ok: true, entity: { type: 'goal', id: row.id, title: row.title } };
    }
    case 'milestone': {
      if (!allowed('goals')) return { ok: false, error: 'الكتابة إلى الأهداف غير مسموحة' };
      const goals = await repo('goals').list({ status: 'active' });
      const goalId = goals.some((g) => g.id === d.goal_id) ? d.goal_id : goals[0]?.id;
      if (!goalId) return { ok: false, error: 'أنشئ هدفًا أولًا قبل إضافة مرحلة' };
      const row = await repo('goal_milestones', 'ms-').create({ goal_id: goalId, title: title || 'مرحلة', done: false, due_date: d.due_date || null });
      return { ok: true, entity: { type: 'milestone', id: row.id, title: row.title } };
    }
    case 'journal': {
      if (!allowed('journal')) return { ok: false, error: 'الكتابة إلى اليوميات غير مسموحة' };
      const row = await repo('journal_entries', 'journal-').create({ title: title || '', content: d.content || proposal.title || '', entry_date: today(), tags: [], mood: null, ai_access: true });
      return { ok: true, entity: { type: 'journal', id: row.id, title: row.title || String(row.content || '').slice(0, 40) } };
    }
    case 'exam': {
      if (!allowed('study')) return { ok: false, error: 'الكتابة إلى الدراسة غير مسموحة' };
      const courses = await repo('courses').list();
      const courseId = courses.some((c) => c.id === d.course_id) ? d.course_id : courses[0]?.id;
      if (!courseId) return { ok: false, error: 'أضف مادة أولًا قبل إنشاء اختبار' };
      const row = await repo('exams', 'exam-').create({ course_id: courseId, title: title || 'اختبار', exam_type: d.exam_type || 'OTHER', exam_date: d.exam_date || null, weight: d.weight ?? null, grade: null, notes: d.notes || '' });
      return { ok: true, entity: { type: 'exam', id: row.id, title: row.title } };
    }
    case 'work_note': {
      if (!allowed('work_notes')) return { ok: false, error: 'الكتابة إلى ملاحظات العمل غير مسموحة' };
      const row = await repo('work_notes', 'wn-').create({ title: title || 'ملاحظة', content: d.content || '', tags: [] });
      return { ok: true, entity: { type: 'work_note', id: row.id, title: row.title } };
    }
    case 'memory': {
      if (!allowed('memories')) return { ok: false, error: 'الكتابة إلى الذاكرة غير مسموحة' };
      const row = await repo('memories', 'mem-').create({ content: d.content || proposal.title || '', type: d.type || 'general', importance: d.importance ?? 0.6, source: 'ai-proposal', source_type: 'ai', source_id: null, confidence: 0.7, tags: [], pinned: false, archived: false, ai_access: true });
      return { ok: true, entity: { type: 'memory', id: row.id, title: String(row.content || '').slice(0, 60) } };
    }
    case 'safe_action': {
      const plans = await repo('safe_living_plans').list();
      const planId = plans.some((p) => p.id === d.plan_id) ? d.plan_id : plans[0]?.id;
      if (!planId) return { ok: false, error: 'أضف خطة عيش آمن أولًا' };
      const sessions = await repo('safe_living_sessions').list({ status: 'active' });
      for (const session of sessions) await repo('safe_living_sessions').update(String(session.id), { status: 'ended' });
      const row = await repo('safe_living_sessions', 'safe-').create({ plan_id: planId, activated_at: now(), status: 'active', notes: '' });
      const plan = plans.find((p) => p.id === planId);
      return { ok: true, entity: { type: 'safe_living_plan', id: planId, title: plan?.name || row.id } };
    }
    default:
      return { ok: false, error: `نوع غير معروف: ${proposal.type}` };
  }
}

export async function mirrorChatTurn(input: { conversationId: string; content: string; assistantContent: string; assistantId?: string; model?: string; provider?: string }) {
  if (!cloudConfigured) return;
  const conversationRepo = repo('conversations', 'conv-');
  if (!(await conversationRepo.get(input.conversationId))) {
    await conversationRepo.create({ id: input.conversationId, title: input.content.slice(0, 60) || 'محادثة', assistant_id: input.assistantId || null, model: input.model || null, provider_id: input.provider || null, tags: [], pinned: false });
  } else {
    await conversationRepo.update(input.conversationId, { updated_at: now(), model: input.model || null, provider_id: input.provider || null });
  }
  await repo('messages', 'msg-').create({ conversation_id: input.conversationId, role: 'user', content: input.content });
  await repo('messages', 'msg-').create({ conversation_id: input.conversationId, role: 'assistant', content: input.assistantContent, model: input.model || null, provider: input.provider || null });
}

async function persistVoiceTurn(input: Record<string, unknown>) {
  const userText = String(input.user_text || '').replace(/\s+/g, ' ').trim();
  const assistantText = String(input.assistant_text || '').replace(/\s+/g, ' ').trim();
  if (!userText || !assistantText) throw new Error('النص الصوتي غير مكتمل.');
  const conversationRepo = repo('conversations', 'conv-');
  let conversationId = String(input.conversation_id || '').trim();
  const existing = conversationId ? await conversationRepo.get(conversationId) : null;
  if (!existing) {
    const created = await conversationRepo.create({
      ...(conversationId ? { id: conversationId } : {}),
      title: userText.slice(0, 60) || 'محادثة صوتية',
      assistant_id: input.assistant_id || null,
      model: input.model || 'gpt-realtime-2.1-mini',
      provider_id: input.provider || 'openai-realtime',
      mode: input.mode || 'general',
      tags: [],
      pinned: false,
    });
    conversationId = String(created.id);
  } else {
    await conversationRepo.update(conversationId, { updated_at: now() });
  }
  await repo('messages', 'msg-').create({ conversation_id: conversationId, role: 'user', content: userText });
  await repo('messages', 'msg-').create({
    conversation_id: conversationId,
    role: 'assistant',
    content: assistantText,
    model: input.model || 'gpt-realtime-2.1-mini',
    provider: input.provider || 'openai-realtime',
    metadata: { voice: true },
  });
  return { conversation_id: conversationId, user_text: userText, assistant_text: assistantText };
}

export async function tryCloudRequest(path: string, method: Method, input?: unknown): Promise<CloudResult> {
  if (!cloudConfigured) return { handled: false };
  const url = new URL(path, window.location.origin);
  const route = url.pathname;
  const body = asObject(input);

  if (route === '/voice/turn' && method === 'POST') return { handled: true, data: await persistVoiceTurn(body) };

  if (route === '/settings' && method === 'GET') return { handled: true, data: await getSettings() };
  if (route === '/settings' && method === 'PUT') return { handled: true, data: await saveSettings(body) };
  if (route === '/export' && method === 'GET') return { handled: true, data: await cloudExport() };
  if (route === '/dashboard/today' && method === 'GET') return { handled: true, data: await dashboard() };
  if (route === '/insights' && method === 'GET') return { handled: true, data: await insights() };
  if (route === '/surprise' && method === 'POST') return { handled: true, data: await cloudSurprise() };

  if (route === '/tasks' && method === 'GET') return { handled: true, data: await tasks(url) };
  if (route === '/tasks' && method === 'POST') return { handled: true, data: await repo('tasks', 'task-').create({ title: body.title || 'مهمة', description: body.description || '', priority: body.priority || 'medium', energy: body.energy || 'medium', est_minutes: body.est_minutes ?? null, due_date: body.due_date || null, project_id: body.project_id || null, course_id: body.course_id || null, tags: body.tags || [], status: body.status || 'inbox', dependencies: body.dependencies || [], notes: body.notes || '', completed_at: body.status === 'done' ? now() : null }) };
  let match = route.match(/^\/tasks\/([^/]+)\/complete$/);
  if (match && method === 'POST') { const current = await repo('tasks').get(match[1]); const done = current?.status !== 'done'; return { handled: true, data: await repo('tasks').update(match[1], { status: done ? 'done' : 'inbox', completed_at: done ? now() : null }) }; }
  match = route.match(/^\/tasks\/([^/]+)$/);
  if (match && method === 'GET') return { handled: true, data: await repo('tasks').get(match[1]) };
  if (match && method === 'PUT') return { handled: true, data: await repo('tasks').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('tasks').delete(match[1]) };

  if (route === '/projects' && method === 'GET') { const [rows, taskRows] = await Promise.all([repo('projects').list(), repo('tasks').list()]); return { handled: true, data: rows.map((row) => ({ ...row, open_tasks: taskRows.filter((task) => task.project_id === row.id && !['done', 'cancelled'].includes(String(task.status))).length })) }; }
  if (route === '/projects' && method === 'POST') return { handled: true, data: await repo('projects', 'prj-').create({ name: body.name || 'مشروع', goal_id: body.goal_id || null, workspace: body.workspace || null, notes: body.notes || '' }) };
  match = route.match(/^\/projects\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('projects').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('projects').delete(match[1]) };

  if (route === '/goals' && method === 'GET') return { handled: true, data: await goals() };
  if (route === '/goals' && method === 'POST') return { handled: true, data: await repo('goals', 'goal-').create({ title: body.title || 'هدف', life_area: body.life_area || null, target_date: body.target_date || null, status: body.status || 'active', progress: body.progress || 0, notes: body.notes || '' }) };
  match = route.match(/^\/goals\/([^/]+)\/milestones$/);
  if (match && method === 'POST') return { handled: true, data: await repo('goal_milestones', 'ms-').create({ goal_id: match[1], title: body.title || 'مرحلة', done: Boolean(body.done), due_date: body.due_date || null }) };
  match = route.match(/^\/goals\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('goals').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('goals').delete(match[1]) };
  match = route.match(/^\/milestones\/([^/]+)$/);
  if (match && method === 'PATCH') return { handled: true, data: await repo('goal_milestones').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('goal_milestones').delete(match[1]) };

  if (route === '/journal' && method === 'GET') { let rows = await repo('journal_entries').list({}, { order: 'entry_date', ascending: false }); rows = filterText(rows, url.searchParams.get('q') || '', ['title', 'content']); const date = url.searchParams.get('date'); if (date) rows = rows.filter((row) => row.entry_date === date); return { handled: true, data: rows }; }
  if (route === '/journal' && method === 'POST') return { handled: true, data: await repo('journal_entries', 'journal-').create({ title: body.title || '', content: body.content || '', entry_date: body.entry_date || today(), tags: body.tags || [], mood: body.mood || null, ai_access: body.ai_access !== false }) };
  match = route.match(/^\/journal\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('journal_entries').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('journal_entries').delete(match[1]) };

  if (route === '/gratitude' && method === 'GET') return { handled: true, data: await repo('gratitude_entries').list({}, { order: 'entry_date', ascending: false }) };
  if (route === '/gratitude' && method === 'POST') return { handled: true, data: await repo('gratitude_entries', 'grat-').create({ items: Array.isArray(body.items) ? body.items : String(body.items || '').split('\n').filter(Boolean), entry_date: body.entry_date || today() }) };
  match = route.match(/^\/gratitude\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('gratitude_entries').delete(match[1]) };

  if (route === '/calendar' && method === 'GET') { let rows = await repo('calendar_events').list({}, { order: 'start' }); const start = url.searchParams.get('start'); const end = url.searchParams.get('end'); if (start) rows = rows.filter((row) => String(row.start) >= start); if (end) rows = rows.filter((row) => String(row.start) <= end); return { handled: true, data: rows }; }
  if (route === '/calendar' && method === 'POST') return { handled: true, data: await repo('calendar_events', 'evt-').create({ title: body.title || 'حدث', start: body.start || now(), end: body.end || null, category: body.category || 'general', location: body.location || null, notes: body.notes || '', reminders: body.reminders || [] }) };
  match = route.match(/^\/calendar\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('calendar_events').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('calendar_events').delete(match[1]) };

  if (route === '/checkins' && method === 'GET') { let rows = await repo('checkins').list({}, { order: 'entry_date', ascending: false }); const date = url.searchParams.get('date'); if (date) rows = rows.filter((row) => row.entry_date === date); return { handled: true, data: rows.slice(0, Number(url.searchParams.get('limit') || 30)) }; }
  match = route.match(/^\/checkins\/([^/]+)$/);
  if (match && method === 'PUT') { const rows = await repo('checkins').list({ entry_date: match[1] }); return { handled: true, data: rows[0] ? await repo('checkins').update(String(rows[0].id), body) : await repo('checkins', 'ck-').create({ ...body, entry_date: match[1] }) }; }

  if (route === '/courses' && method === 'GET') return { handled: true, data: await courses() };
  if (route === '/study/analytics' && method === 'GET') return { handled: true, data: await cloudStudyAnalytics(Number(url.searchParams.get('days') || 14)) };
  if (route === '/study/sessions' && method === 'POST') return { handled: true, data: await saveCloudStudySession(body) };
  if (route === '/courses' && method === 'POST') return { handled: true, data: await repo('courses', 'course-').create({ name: body.name || 'مادة', code: body.code || null, credit_hours: body.credit_hours || 3, instructor: body.instructor || null, semester: body.semester || null, target_grade: body.target_grade || null, notes: body.notes || '', color: body.color || null }) };
  match = route.match(/^\/courses\/([^/]+)\/topics$/);
  if (match && method === 'POST') return { handled: true, data: await repo('course_topics', 'topic-').create({ course_id: match[1], title: body.title || 'موضوع', notes: body.notes || '', done: Boolean(body.done) }) };
  match = route.match(/^\/courses\/([^/]+)$/);
  if (match && method === 'GET') return { handled: true, data: await cloudCourseDetail(match[1]) };
  if (match && method === 'PUT') return { handled: true, data: await repo('courses').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('courses').delete(match[1]) };
  match = route.match(/^\/topics\/([^/]+)$/);
  if (match && method === 'PATCH') return { handled: true, data: await repo('course_topics').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('course_topics').delete(match[1]) };
  if (route === '/study/quiz/answer' && method === 'POST') {
    return {
      handled: true,
      data: {
        ok: true,
        mastery: null,
        misconception: body.correct !== true && Number(body.confidence || 0) >= 4,
      },
    };
  }
  if (route === '/exams' && method === 'GET') { const [rows, courseRows] = await Promise.all([repo('exams').list({}, { order: 'exam_date' }), repo('courses').list()]); const map = new Map(courseRows.map((row) => [row.id, row])); return { handled: true, data: rows.map((row) => ({ ...row, course_name: map.get(String(row.course_id || ''))?.name, color: map.get(String(row.course_id || ''))?.color })) }; }
  if (route === '/exams' && method === 'POST') return { handled: true, data: await repo('exams', 'exam-').create({ course_id: body.course_id, title: body.title || 'امتحان', exam_type: body.exam_type || 'OTHER', exam_date: body.exam_date || null, weight: body.weight ?? null, grade: body.grade ?? null, notes: body.notes || '' }) };
  match = route.match(/^\/exams\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('exams').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('exams').delete(match[1]) };

  if (route === '/work/shifts' && method === 'GET') return { handled: true, data: await repo('work_shifts').list({}, { order: 'shift_start', ascending: false }) };
  if (route === '/work/shifts' && method === 'POST') return { handled: true, data: await repo('work_shifts', 'shift-').create({ shift_start: body.shift_start || now(), shift_end: body.shift_end || null, role: body.role || null, notes: body.notes || '' }) };
  match = route.match(/^\/work\/shifts\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('work_shifts').delete(match[1]) };
  if (route === '/work/notes' && method === 'GET') return { handled: true, data: filterText(await repo('work_notes').list({}, { order: 'updated_at', ascending: false }), url.searchParams.get('q') || '', ['title', 'content']) };
  if (route === '/work/notes' && method === 'POST') return { handled: true, data: await repo('work_notes', 'work-').create({ title: body.title || 'ملاحظة', content: body.content || '', tags: body.tags || [] }) };
  match = route.match(/^\/work\/notes\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('work_notes').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('work_notes').delete(match[1]) };

  if (route === '/safe/status' && method === 'GET') return { handled: true, data: await safeStatus() };
  if (route === '/safe/plans' && method === 'GET') return { handled: true, data: await repo('safe_living_plans').list({}, { order: 'created_at', ascending: false }) };
  if (route === '/safe/plans' && method === 'POST') return { handled: true, data: await repo('safe_living_plans', 'plan-').create({ name: body.name || 'خطة', trigger: body.trigger || '', signs: body.signs || '', immediate_actions: body.immediate_actions || [], not_to_do: body.not_to_do || [], resources: body.resources || [], reminders: body.reminders || [], audio_scene: body.audio_scene || null, ai_instructions: body.ai_instructions || '' }) };
  match = route.match(/^\/safe\/plans\/([^/]+)$/);
  if (match && method === 'GET') return { handled: true, data: await repo('safe_living_plans').get(match[1]) };
  if (match && method === 'PUT') return { handled: true, data: await repo('safe_living_plans').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('safe_living_plans').delete(match[1]) };
  if (route === '/safe/sessions' && method === 'GET') { const [rows, plans] = await Promise.all([repo('safe_living_sessions').list({}, { order: 'activated_at', ascending: false }), repo('safe_living_plans').list()]); const names = new Map(plans.map((row) => [row.id, row.name])); return { handled: true, data: rows.map((row) => ({ ...row, plan_name: names.get(String(row.plan_id || '')) })) }; }
  if (route === '/safe/activate' && method === 'POST') return { handled: true, data: await repo('safe_living_sessions', 'safe-').create({ plan_id: body.plan_id || null, activated_at: now(), status: 'active', notes: '' }) };
  if (route === '/safe/end' && method === 'POST') { const active = (await repo('safe_living_sessions').list({ status: 'active' }, { order: 'activated_at', ascending: false }))[0]; return { handled: true, data: active ? await repo('safe_living_sessions').update(String(active.id), { status: 'ended' }) : { ok: true } }; }

  if (route === '/memory/harvest' && method === 'POST') return { handled: true, data: await harvestCloudMemories(Number(body.days || 7)) };
  if (route === '/memory/types' && method === 'GET') { const rows = await repo('memories').list(); return { handled: true, data: [...new Set(['general', 'preference', 'episodic', 'semantic', 'project', 'event', 'goal', 'habit', 'study', 'work', ...rows.map((row) => String(row.type || '')).filter(Boolean)])].sort() }; }
  if (route === '/memory/sources' && method === 'GET') { const rows = await repo('memories').list(); return { handled: true, data: [...new Set(['user', 'journal', 'task', 'checkin', 'focus', 'goal', 'exam', 'work', 'safe', 'conversation', 'ai', ...rows.map((row) => String(row.source_type || '')).filter(Boolean)])].sort() }; }
  if ((route === '/memory' || route === '/memory/search') && method === 'GET') { let rows = await repo('memories').list({}, { order: 'updated_at', ascending: false }); rows = filterText(rows, url.searchParams.get('q') || '', ['content', 'source']); const type = url.searchParams.get('type'); const source = url.searchParams.get('source'); if (type) rows = rows.filter((row) => row.type === type); if (source) rows = rows.filter((row) => row.source_type === source); if (url.searchParams.get('pinned') === '1') rows = rows.filter((row) => row.pinned); if (url.searchParams.get('archived') !== '1') rows = rows.filter((row) => !row.archived); return { handled: true, data: rows.slice(0, Number(url.searchParams.get('limit') || (route.endsWith('search') ? 8 : 100))) }; }
  if (route === '/memory' && method === 'POST') return { handled: true, data: await repo('memories', 'mem-').create({ content: body.content, type: body.type || 'general', importance: body.importance ?? 0.5, source: body.source || 'user', source_type: body.source_type || null, source_id: body.source_id || null, confidence: body.confidence ?? 0.5, tags: body.tags || [], pinned: Boolean(body.pinned), archived: false, ai_access: body.ai_access !== false }) };
  if (route === '/memory' && method === 'DELETE') { for (const row of await repo('memories').list()) await repo('memories').delete(String(row.id)); return { handled: true, data: { ok: true } }; }
  match = route.match(/^\/memory\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('memories').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('memories').delete(match[1]) };

  if (route === '/knowledge' && method === 'GET') return { handled: true, data: await knowledgeList() };
  if (route === '/knowledge' && method === 'POST') return { handled: true, data: await repo('knowledge_bases', 'kb-').create({ name: body.name || 'معرفة', description: body.description || '' }) };
  if (route === '/knowledge/import' && method === 'POST') return { handled: true, data: await importKnowledge(body) };
  if (route === '/knowledge/search' && method === 'GET') { let rows = filterText(await repo('document_chunks').list(), url.searchParams.get('q') || '', ['content']); const kbIds = (url.searchParams.get('kb') || '').split(',').filter(Boolean); if (kbIds.length) { const docs = await repo('documents').list(); const allowed = new Set(docs.filter((row) => kbIds.includes(String(row.kb_id))).map((row) => String(row.id))); rows = rows.filter((row) => allowed.has(String(row.document_id))); } return { handled: true, data: rows.slice(0, Number(url.searchParams.get('limit') || 6)) }; }
  match = route.match(/^\/knowledge\/documents\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('documents').delete(match[1]) };
  match = route.match(/^\/knowledge\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('knowledge_bases').delete(match[1]) };

  if (route === '/audio/files' && method === 'GET') return { handled: true, data: await audioRows() };
  if (route === '/audio/import' && method === 'POST') return { handled: true, data: await importAudio(body) };
  match = route.match(/^\/audio\/files\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('audio_files').update(match[1], body) };
  if (match && method === 'DELETE') { const row = await repo('audio_files').get(match[1]); if (row?.path) await requireSupabase().storage.from('aishaman-private').remove([String(row.path)]); return { handled: true, data: await repo('audio_files').delete(match[1]) }; }
  if (route === '/audio/scenes' && method === 'GET') return { handled: true, data: await repo('sound_scenes').list({}, { order: 'created_at', ascending: false }) };
  if (route === '/audio/scenes' && method === 'POST') return { handled: true, data: await repo('sound_scenes', 'scene-').create({ name: body.name || 'مشهد', tracks: body.tracks || [], volume: body.volume ?? 0.8, tts_voice: body.tts_voice || null, timer_minutes: body.timer_minutes || null, theme: body.theme || null }) };
  match = route.match(/^\/audio\/scenes\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('sound_scenes').delete(match[1]) };

  if (route === '/focus/sessions' && method === 'GET') { const [rows, taskRows] = await Promise.all([repo('focus_sessions').list({}, { order: 'started_at', ascending: false }), repo('tasks').list()]); const names = new Map(taskRows.map((row) => [row.id, row.title])); return { handled: true, data: rows.slice(0, Number(url.searchParams.get('limit') || 50)).map((row) => ({ ...row, task_title: names.get(String(row.task_id || '')) || null })) }; }
  if (route === '/focus/start' && method === 'POST') return { handled: true, data: await repo('focus_sessions', 'focus-').create({ started_at: now(), minutes: Number(body.minutes || 25), task_id: body.task_id || null, completed: false }) };
  match = route.match(/^\/focus\/([^/]+)\/complete$/);
  if (match && method === 'POST') return { handled: true, data: await repo('focus_sessions').update(match[1], { completed: true, ended_at: now() }) };
  match = route.match(/^\/focus\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('focus_sessions').delete(match[1]) };

  if (route === '/assistants' && method === 'GET') {
    const rows = await repo('assistants').list({}, { order: 'created_at' });
    return { handled: true, data: rows.length ? rows : [{ id: 'assistant-cloud-general', name: 'المساعد العام', slug: 'general', description: 'مساعد عيش آمن السحابي', system_prompt: null, model: 'deepseek-chat', provider_id: 'prov-deepseek-cloud', temperature: 0.6, context_limit: null, memory_permissions: {}, tool_permissions: [], voice: null, response_style: 'balanced', knowledge_base_ids: [], is_default: true }] };
  }
  if (route === '/models' && method === 'GET') return { handled: true, data: CLOUD_MODELS };
  if (route === '/folders' && method === 'GET') { const [rows, conversations] = await Promise.all([repo('conversation_folders').list(), repo('conversations').list()]); return { handled: true, data: rows.map((row) => ({ ...row, count: conversations.filter((item) => item.folder === row.name).length })) }; }
  if (route === '/folders' && method === 'POST') return { handled: true, data: await repo('conversation_folders', 'folder-').create({ name: body.name || 'مجلد', color: body.color || null }) };
  match = route.match(/^\/folders\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('conversation_folders').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('conversation_folders').delete(match[1]) };
  if (route === '/conversations/import' && method === 'POST') return { handled: true, data: await importCloudConversations(body) };
  if (route === '/conversations' && method === 'GET') { let rows = filterText(await repo('conversations').list({}, { order: 'updated_at', ascending: false }), url.searchParams.get('q') || '', ['title']); const messages = await repo('messages').list(); rows = rows.map((row) => { const own = messages.filter((item) => item.conversation_id === row.id); return { ...row, message_count: own.length, last_message_at: own.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.created_at || null }; }); return { handled: true, data: rows }; }
  match = route.match(/^\/conversations\/([^/]+)\/messages$/);
  if (match && method === 'GET') return { handled: true, data: await repo('messages').list({ conversation_id: match[1] }, { order: 'created_at' }) };
  match = route.match(/^\/conversations\/([^/]+)\/context$/);
  if (match && method === 'GET') return { handled: true, data: (await repo('conversations').get(match[1]))?.context || [] };
  if (match && method === 'PUT') { const row = await repo('conversations').update(match[1], { context: body.items || [] }); return { handled: true, data: row.context || [] }; }
  match = route.match(/^\/conversations\/([^/]+)\/export$/);
  if (match && method === 'GET') { const conversation = await repo('conversations').get(match[1]); const messages = await repo('messages').list({ conversation_id: match[1] }, { order: 'created_at' }); return { handled: true, data: { app: 'aish-aman', type: 'conversation', version: 1, conversation, messages } }; }
  match = route.match(/^\/conversations\/([^/]+)$/);
  if (match && method === 'PUT') return { handled: true, data: await repo('conversations').update(match[1], body) };
  if (match && method === 'DELETE') return { handled: true, data: await repo('conversations').delete(match[1]) };
  match = route.match(/^\/messages\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('messages').delete(match[1]) };

  if (route === '/ai/execute' && method === 'POST') return { handled: true, data: await executeCloudProposal(asObject(body.proposal)) };

  if (route === '/timeline' && method === 'GET') return { handled: true, data: await cloudTimeline(url) };
  if (route === '/search' && method === 'GET') return { handled: true, data: await universalSearch(url) };
  if ((route === '/graph' || route === '/graph/expand') && method === 'GET') return { handled: true, data: await graphData(url) };
  if (route === '/smart-context' && method === 'GET') return { handled: true, data: await smartContext(url) };
  if (route === '/ai/context-modes' && method === 'GET') return { handled: true, data: ['general', 'university', 'work', 'safe', 'reflection', 'planning'] };
  if (route === '/events' && method === 'GET') return { handled: true, data: await repo('activity_events').list({}, { order: 'created_at', ascending: false, limit: Number(url.searchParams.get('limit') || 30) }) };
  if (route === '/audio/presets' && method === 'GET') return { handled: true, data: await repo('audio_presets').list({}, { order: 'created_at', ascending: false }) };
  if (route === '/providers' && method === 'GET') return { handled: true, data: CLOUD_PROVIDERS };
  if (route === '/providers/primary' && method === 'POST') return { handled: true, data: { ok: true } };
  // /ai/status and /providers/:id/test intentionally go through the Vercel AI backend.
  if (route === '/backups' && method === 'GET') return { handled: true, data: [] };
  if (route === '/links/suggestions' && method === 'GET') return { handled: true, data: (await repo('link_suggestions').list()).filter((row) => row.status === 'pending') };
  match = route.match(/^\/links\/suggestions\/([^/]+)\/(accept|reject)$/);
  if (match && method === 'POST') { const suggestion = await repo('link_suggestions').get(match[1]); if (!suggestion) return { handled: true, data: { ok: false } }; if (match[2] === 'accept') { const link = await repo('entity_links', 'link-').create({ ...suggestion, id: undefined, created_by: 'user' }); await repo('link_suggestions').update(match[1], { status: 'accepted' }); return { handled: true, data: { ok: true, link } }; } await repo('link_suggestions').update(match[1], { status: 'rejected' }); return { handled: true, data: { ok: true } }; }
  if (route === '/links/recent' && method === 'GET') return { handled: true, data: (await repo('entity_links').list({}, { order: 'created_at', ascending: false })).slice(0, 8) };
  match = route.match(/^\/links\/([^/]+)$/);
  if (match && method === 'DELETE') return { handled: true, data: await repo('entity_links').delete(match[1]) };
  if (route === '/links' && method === 'POST') { const link = await repo('entity_links', 'link-').create({ ...body, relationship_type: body.relationship_type || 'related_to', confidence: body.confidence ?? 1, created_by: 'user' }); return { handled: true, data: { ok: true, link } }; }
  match = route.match(/^\/related\/([^/]+)\/([^/]+)$/);
  if (match && method === 'GET') { const links = await repo('entity_links').list(); const related = links.filter((row) => (row.source_type === match[1] && row.source_id === match[2]) || (row.target_type === match[1] && row.target_id === match[2])).map((row) => row.source_type === match[1] && row.source_id === match[2] ? { link_id: row.id, type: row.target_type, id: row.target_id, title: row.target_id, relationship_type: row.relationship_type, confidence: row.confidence, created_by: row.created_by, direction: 'out' } : { link_id: row.id, type: row.source_type, id: row.source_id, title: row.source_id, relationship_type: row.relationship_type, confidence: row.confidence, created_by: row.created_by, direction: 'in' }); return { handled: true, data: { type: match[1], id: match[2], related, suggestions: [] } }; }

  return { handled: false };
}
