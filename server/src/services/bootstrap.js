import { onDomainEvent, EVENT_TYPES } from './events.js';
import { logActivity } from './activity.js';
import { harvestMemory } from './memory.js';
import { suggestLinksForEntity } from './links.js';

/**
 * Wires domain events to their consumers. Called once at boot.
 * Consumers: activity log (everything), memory harvesting, and
 * rule-based relationship discovery for created entities.
 */
export function bootstrapEvents() {
  // 1. Every domain event is written to the activity index.
  const activityHandlers = [
    EVENT_TYPES.TASK_COMPLETED,
    EVENT_TYPES.TASK_CREATED,
    EVENT_TYPES.JOURNAL_CREATED,
    EVENT_TYPES.CHECKIN_CREATED,
    EVENT_TYPES.FOCUS_COMPLETED,
    EVENT_TYPES.EXAM_GRADE_RECORDED,
    EVENT_TYPES.EXAM_CREATED,
    EVENT_TYPES.GOAL_PROGRESS_CHANGED,
    EVENT_TYPES.MILESTONE_COMPLETED,
    EVENT_TYPES.CONVERSATION_MESSAGE_CREATED,
    EVENT_TYPES.CONVERSATION_CREATED,
    EVENT_TYPES.WORK_NOTE_CREATED,
    EVENT_TYPES.SAFE_PLAN_ACTIVATED,
    EVENT_TYPES.COURSE_CREATED,
    EVENT_TYPES.MEMORY_CREATED,
  ];
  for (const type of activityHandlers) {
    onDomainEvent(type, (p) => {
      logActivity({
        eventType: type,
        entityType: p.entityType,
        entityId: p.entityId,
        summary: p.summary || p.title || type,
        metadata: p.metadata || {},
      });
    });
  }

  // 2. Memory harvesting from life events.
  onDomainEvent(EVENT_TYPES.TASK_COMPLETED, (p) => {
    harvestMemory({ sourceType: 'task', sourceId: p.entityId, content: `أنجزت مهمة: ${p.title}`, importance: 0.45, tags: ['task'] });
  });
  onDomainEvent(EVENT_TYPES.CHECKIN_CREATED, (p) => {
    if (p.summary) harvestMemory({ sourceType: 'checkin', sourceId: p.entityId, content: p.summary, importance: 0.3, tags: ['checkin'] });
  });
  onDomainEvent(EVENT_TYPES.MILESTONE_COMPLETED, (p) => {
    harvestMemory({ sourceType: 'milestone', sourceId: p.entityId, content: `أنجزت مرحلة: ${p.title}${p.goalTitle ? ` — ${p.goalTitle}` : ''}`, importance: 0.5, tags: ['goal'] });
  });
  onDomainEvent(EVENT_TYPES.FOCUS_COMPLETED, (p) => {
    harvestMemory({ sourceType: 'focus', sourceId: p.entityId, content: `جلسة تركيز ${p.minutes} دقيقة (${p.date})`, importance: 0.25, tags: ['focus'] });
  });
  onDomainEvent(EVENT_TYPES.EXAM_GRADE_RECORDED, (p) => {
    harvestMemory({ sourceType: 'exam', sourceId: p.entityId, content: `درجة ${p.title}${p.courseName ? ` (${p.courseName})` : ''}: ${p.grade}`, importance: 0.55, tags: ['study'] });
  });
  onDomainEvent(EVENT_TYPES.SAFE_PLAN_ACTIVATED, (p) => {
    harvestMemory({ sourceType: 'safe-plan', sourceId: p.entityId, content: `فُعّلت خطة العيش الآمن: ${p.title}`, importance: 0.4, tags: ['safe'] });
  });

  // 3. Rule-based relationship discovery for newly created entities.
  const discoveryEvents = [
    EVENT_TYPES.TASK_CREATED,
    EVENT_TYPES.JOURNAL_CREATED,
    EVENT_TYPES.EXAM_CREATED,
    EVENT_TYPES.GOAL_PROGRESS_CHANGED,
    EVENT_TYPES.WORK_NOTE_CREATED,
    EVENT_TYPES.COURSE_CREATED,
    EVENT_TYPES.CONVERSATION_CREATED,
  ];
  for (const type of discoveryEvents) {
    onDomainEvent(type, (p) => {
      if (!p.entityType || !p.entityId) return;
      try {
        suggestLinksForEntity(p.entityType, p.entityId);
      } catch (e) {
        console.error(`[links] discovery failed for ${p.entityType}:${p.entityId}:`, e.message);
      }
    });
  }
}
