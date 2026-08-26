import fs from 'node:fs';

// ---- data.js: task/journal/goal creation events ----
let p = 'src/routes/data.js';
let s = fs.readFileSync(p, 'utf8');
// task create
s = s.replace(
  `  res.status(201).json(rowTask(get('SELECT * FROM tasks WHERE id = ?', id)));
});`,
  `  emitDomainEvent(EVENT_TYPES.TASK_CREATED, { entityType: 'task', entityId: id, title: b.title || 'مهمة' });
  res.status(201).json(rowTask(get('SELECT * FROM tasks WHERE id = ?', id)));
});`,
);
// journal create
s = s.replace(
  `  res.status(201).json(rowJournal(get('SELECT * FROM journal_entries WHERE id = ?', id)));
});`,
  `  emitDomainEvent(EVENT_TYPES.JOURNAL_CREATED, { entityType: 'journal', entityId: id, title: b.title || '' });
  res.status(201).json(rowJournal(get('SELECT * FROM journal_entries WHERE id = ?', id)));
});`,
);
// goal create
s = s.replace(
  `  res.status(201).json(get('SELECT * FROM goals WHERE id = ?', id));
});`,
  `  emitDomainEvent(EVENT_TYPES.GOAL_PROGRESS_CHANGED, { entityType: 'goal', entityId: id, title: b.title || 'هدف' });
  res.status(201).json(get('SELECT * FROM goals WHERE id = ?', id));
});`,
);
fs.writeFileSync(p, s);

// ---- study-work.js: course/exam/work-note creation events ----
p = 'src/routes/study-work.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  `  res.status(201).json(get('SELECT * FROM courses WHERE id = ?', id));
});`,
  `  emitDomainEvent(EVENT_TYPES.COURSE_CREATED, { entityType: 'course', entityId: id, title: b.name || 'مادة' });
  res.status(201).json(get('SELECT * FROM courses WHERE id = ?', id));
});`,
);
s = s.replace(
  `  res.status(201).json(get('SELECT * FROM exams WHERE id = ?', id));
});`,
  `  emitDomainEvent(EVENT_TYPES.EXAM_CREATED, { entityType: 'exam', entityId: id, title: b.title || 'امتحان' });
  res.status(201).json(get('SELECT * FROM exams WHERE id = ?', id));
});`,
);
s = s.replace(
  `  res.status(201).json(get('SELECT * FROM work_notes WHERE id = ?', id));
});`,
  `  emitDomainEvent(EVENT_TYPES.WORK_NOTE_CREATED, { entityType: 'work_note', entityId: id, title: b.title || 'ملاحظة عمل' });
  res.status(201).json(get('SELECT * FROM work_notes WHERE id = ?', id));
});`,
);
fs.writeFileSync(p, s);

// ---- services/memory.js: MemoryCreated event ----
p = 'src/services/memory.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { uid, nowIso, parseJson, ftsQuery } from '../lib/util.js';",
  "import { uid, nowIso, parseJson, ftsQuery } from '../lib/util.js';\nimport { emitDomainEvent, EVENT_TYPES } from './events.js';",
);
s = s.replace(
  `  for (const tag of tags) {
    run('INSERT OR IGNORE INTO memory_tags(memory_id, tag) VALUES (?,?)', id, tag);
  }
  rebuildFts();
  return getMemory(id);
}`,
  `  for (const tag of tags) {
    run('INSERT OR IGNORE INTO memory_tags(memory_id, tag) VALUES (?,?)', id, tag);
  }
  rebuildFts();
  emitDomainEvent(EVENT_TYPES.MEMORY_CREATED, { entityType: 'memory', entityId: id, summary: content.trim().slice(0, 80) });
  return getMemory(id);
}`,
);
fs.writeFileSync(p, s);

// ---- services/chat.js: conversation/message events ----
p = 'src/services/chat.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { logEvent } from '../db/index.js';",
  "import { logEvent } from '../db/index.js';\nimport { emitDomainEvent, EVENT_TYPES } from './events.js';",
);
s = s.replace(
  `  return getConversation(id);
}

export function updateConversation`,
  `  emitDomainEvent(EVENT_TYPES.CONVERSATION_CREATED, { entityType: 'conversation', entityId: id, title: title || 'محادثة جديدة' });
  return getConversation(id);
}

export function updateConversation`,
);
s = s.replace(
  `  return getMessage(msg.id);
}

export function updateMessage`,
  `  if (msg.role === 'user') {
    emitDomainEvent(EVENT_TYPES.CONVERSATION_MESSAGE_CREATED, { entityType: 'conversation', entityId: msg.conversation_id, summary: msg.content.slice(0, 80) });
  }
  return getMessage(msg.id);
}

export function updateMessage`,
);
fs.writeFileSync(p, s);

// ---- app.js: bootstrap events + backfill ----
p = 'src/app.js';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { openDb, logEvent } from './db/index.js';",
  "import { openDb, logEvent } from './db/index.js';\nimport { bootstrapEvents } from './services/bootstrap.js';\nimport { backfillActivity } from './services/activity.js';",
);
s = s.replace(
  `  openDb();
  logEvent('info', 'app', 'Aish Aman OS server started');`,
  `  openDb();
  logEvent('info', 'app', 'Aish Aman OS server started');
  bootstrapEvents();
  try {
    const backfilled = backfillActivity({ days: 90 });
    if (backfilled.added > 0) logEvent('info', 'app', \`Activity index backfilled: \${backfilled.added} events\`);
  } catch (e) {
    logEvent('error', 'app', 'Activity backfill failed: ' + e.message);
  }`,
);
fs.writeFileSync(p, s);

console.log('creation-event patches applied');
