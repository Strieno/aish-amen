import { EventEmitter } from 'node:events';

/**
 * Lightweight in-process domain event bus.
 * Routes emit typed events; handlers (memory harvest, activity log,
 * link discovery) subscribe here — no modules are coupled directly.
 */
const emitter = new EventEmitter();

export function emitDomainEvent(type, payload) {
  // Never let a consumer crash the request path.
  try {
    emitter.emit(type, payload);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[events] handler error for ${type}:`, e.message);
  }
}

export function onDomainEvent(type, handler) {
  emitter.on(type, handler);
  return () => emitter.off(type, handler);
}

/** Subscribe to every domain event type (used by the live SSE feed). */
export function onAnyDomainEvent(handler) {
  const types = Object.values(EVENT_TYPES);
  const subs = types.map((t) => {
    const wrapped = (payload) => handler(payload, t);
    emitter.on(t, wrapped);
    return [t, wrapped];
  });
  return () => {
    for (const [t, wrapped] of subs) emitter.off(t, wrapped);
  };
}

export const EVENT_TYPES = {
  TASK_COMPLETED: 'TaskCompleted',
  TASK_CREATED: 'TaskCreated',
  TASK_UPDATED: 'TaskUpdated',
  JOURNAL_CREATED: 'JournalEntryCreated',
  CHECKIN_CREATED: 'CheckInCreated',
  FOCUS_COMPLETED: 'FocusSessionCompleted',
  EXAM_GRADE_RECORDED: 'ExamGradeRecorded',
  EXAM_CREATED: 'ExamCreated',
  GOAL_PROGRESS_CHANGED: 'GoalProgressChanged',
  MILESTONE_COMPLETED: 'MilestoneCompleted',
  CONVERSATION_MESSAGE_CREATED: 'ConversationMessageCreated',
  CONVERSATION_CREATED: 'ConversationCreated',
  WORK_NOTE_CREATED: 'WorkNoteCreated',
  SAFE_PLAN_ACTIVATED: 'SafePlanActivated',
  COURSE_CREATED: 'CourseCreated',
  MEMORY_CREATED: 'MemoryCreated',
  LINK_CREATED: 'LinkCreated',
  LINK_REMOVED: 'LinkRemoved',
};
