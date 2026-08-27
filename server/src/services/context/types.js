/**
 * ACE — Aish Aman Context Engine — shared JSDoc types.
 *
 * The server is plain ESM JavaScript, so these are documentation typedefs
 * that keep the module self-describing and future TypeScript-friendly.
 */

/**
 * @typedef {'task'|'goal'|'memory'|'journal'|'study'|'work'|'focus'|'checkin'|'safe_living'|'gratitude'|'conversation'|'schedule'|'profile'} ContextSource
 */

/**
 * @typedef {Object} ContextItem
 * @property {string} [id]
 * @property {ContextSource} source
 * @property {string} text
 * @property {number} score           0..1
 * @property {string} [createdAt]
 * @property {number} [importance]    0..1
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} ContextPattern
 * @property {string} label
 * @property {string} evidence
 * @property {number} confidence      0..1
 */

/**
 * @typedef {Object} ContextRisk
 * @property {string} label
 * @property {string} detail
 * @property {'low'|'medium'|'high'} severity
 * @property {ContextSource} [source]
 */

/**
 * @typedef {Object} ContextMetadata
 * @property {string} generatedAt
 * @property {number} candidateCount
 * @property {number} selectedCount
 * @property {number} estimatedTokens
 * @property {string} intent
 * @property {number} intentConfidence
 * @property {number} buildTimeMs
 * @property {string[]} signals
 */

/**
 * @typedef {Object} ContextPacket
 * @property {string} intent
 * @property {ContextItem[]} currentContext
 * @property {ContextItem[]} relevantMemories
 * @property {ContextItem[]} activeGoals
 * @property {ContextItem[]} importantTasks
 * @property {ContextItem[]} recentEvents
 * @property {ContextPattern[]} detectedPatterns
 * @property {ContextRisk[]} risks
 * @property {string} recommendedFocus
 * @property {string} assistantGuidance
 * @property {ContextMetadata} metadata
 */

export {};
