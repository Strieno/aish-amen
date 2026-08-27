/**
 * ACE intent detection — hybrid approach.
 *
 * Primary: lightweight keyword heuristics (fast, deterministic, cheap).
 * Optional: an AI classifier can be registered via setAiIntentClassifier and
 * is consulted only when the keyword signal is weak.
 */

export const ACE_INTENTS = [
  'study',
  'work',
  'planning',
  'tasks',
  'goals',
  'reflection',
  'memory',
  'safe_living',
  'general',
];

// Phrase -> weight. Arabic first, English fallback. Substring matching is used,
// so "بالدراسة" and "study" both hit the study intent.
const INTENT_KEYWORDS = {
  study: [
    ['دراسة', 1.4], ['ذاكر', 1.6], ['امتحان', 1.6], ['اختبار', 1.3], ['مذاكرة', 1.6],
    ['مادة', 1.0], ['محاضرة', 1.3], ['أستاذ', 1.0], ['واجب', 1.0], ['بحث', 0.8],
    ['منهج', 1.2], ['تفوق', 1.0], ['علامات', 1.0], ['درجات', 1.0], ['ترم', 1.0],
    ['study', 1.4], ['exam', 1.5], ['quiz', 1.2], ['course', 1.0], ['homework', 1.0],
    ['lecture', 1.2], ['assignment', 1.1], ['gpa', 1.0],
  ],
  work: [
    ['دوام', 1.5], ['شفت', 1.5], ['مناوبة', 1.5], ['عمل', 1.0], ['وظيفة', 1.2],
    ['مدير', 1.0], ['زملاء', 1.0], ['مرتب', 1.2], ['راتب', 1.2], ['مشروع عمل', 1.2],
    ['وردية', 1.4], ['مهمة عمل', 1.2],
    ['work', 1.2], ['shift', 1.5], ['job', 1.2], ['salary', 1.2], ['manager', 1.0],
    ['colleague', 1.0],
  ],
  planning: [
    ['خطط لي', 1.8], ['خطط', 1.3], ['جدول', 1.2], ['تنظيم يومي', 1.6], ['أنظم وقتي', 1.6],
    ['روتين', 1.3], ['أسبوعي', 1.1], ['جدولة', 1.4], ['أولويات', 1.2], ['برنامج يوم', 1.5],
    ['plan', 1.3], ['schedule', 1.2], ['routine', 1.2], ['organize', 1.2], ['itinerary', 1.2],
  ],
  tasks: [
    ['مهمة', 1.2], ['مهام', 1.3], ['مؤجل', 1.2], ['أنهي', 1.1], ['إنجاز', 1.2],
    ['أولويتي', 1.4], ['مستعجل', 1.3], ['مستعجلة', 1.3], ['قائمة', 0.8],
    ['task', 1.2], ['todo', 1.2], ['to-do', 1.3], ['priority', 1.2], ['urgent', 1.3],
  ],
  goals: [
    ['هدف', 1.4], ['أهداف', 1.4], ['طموح', 1.2], ['إنجازي', 1.2], ['تحقيق', 1.1],
    ['مرحلة', 0.9], ['تقدمي نحو', 1.3], ['نفسي', 0.6], ['تطوير ذاتي', 1.3],
    ['goal', 1.3], ['goals', 1.4], ['milestone', 1.1], ['ambition', 1.2],
  ],
  reflection: [
    ['أشعر', 1.2], ['مزاجي', 1.3], ['حالتي', 1.2], ['تأمل', 1.4], ['أفكاري', 1.2],
    ['قلق', 1.2], ['متعب', 1.1], ['تعبان', 1.1], ['حزين', 1.2], ['سعيد', 1.0],
    ['ضغط', 1.2], ['يومياتي', 1.4], ['مراجعة يومي', 1.5], ['تقييم يومي', 1.5],
    ['feel', 1.1], ['mood', 1.3], ['anxious', 1.2], ['reflect', 1.3], ['overwhelmed', 1.3],
    ['journal', 1.0], ['stress', 1.1], ['emotion', 1.1],
  ],
  memory: [
    ['تذكر', 1.3], ['تتذكر', 1.3], ['أذكر', 1.1], ['ذاكرتي', 1.5], ['ذاكرة', 1.3],
    ['عن نفسي', 1.2], ['ماذا تعرف عني', 1.8], ['معلومات عني', 1.6], ['حفظت', 1.2],
    ['ذكريات', 1.4], ['ملاحظات سابقة', 1.3],
    ['remember', 1.3], ['memory', 1.3], ['memories', 1.4], ['what do you know about me', 1.8],
  ],
  safe_living: [
    ['عيش آمن', 1.6], ['خطة أمان', 1.6], ['خطة العيش', 1.6], ['مطمئن', 1.0],
    ['أمان', 1.1], ['أطمئن', 1.2], ['استرخاء', 1.0], ['تهدئة', 1.2], ['نوبة', 1.2],
    ['ضيق', 1.3], ['هلع', 1.5], ['أزمة', 1.3], ['سلامة', 1.0],
    ['safe', 1.1], ['calm me', 1.4], ['panic', 1.4], ['crisis', 1.3], ['anxiety attack', 1.5],
  ],
};

// The chat UI has a context-mode selector; reuse it as a strong prior.
const MODE_INTENT_PRIOR = {
  university: 'study',
  work: 'work',
  planning: 'planning',
  safe: 'safe_living',
  reflection: 'reflection',
  general: null,
};

let aiClassifier = null;

/** Register an optional AI intent classifier: async (message) => {intent, confidence}. */
export function setAiIntentClassifier(fn) {
  aiClassifier = typeof fn === 'function' ? fn : null;
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Detect the user's intent.
 * Synchronous keyword heuristic — fast and deterministic.
 * @param {string} message
 * @param {{ mode?: string }} [opts]
 * @returns {{ intent: string, confidence: number, signals: string[] }}
 */
export function detectIntent(message = '', { mode = 'general' } = {}) {
  const text = normalize(message);
  const signals = [];
  const scores = {};

  for (const intent of Object.keys(INTENT_KEYWORDS)) {
    let score = 0;
    for (const [phrase, weight] of INTENT_KEYWORDS[intent]) {
      if (text.includes(phrase)) {
        score += weight;
        signals.push(phrase);
      }
    }
    scores[intent] = score;
  }

  // Mode prior: the user explicitly picked a context mode in chat.
  const prior = MODE_INTENT_PRIOR[mode];
  if (prior && scores[prior] !== undefined) scores[prior] += 0.9;

  // Generic "how is X going / وضعي" phrasing biases toward X when weak.
  if (/وضعي|كيف.*(دراسة|دوام|عمل|يومي|حالتي)/.test(text)) {
    if (/دراسة/.test(text)) scores.study += 1.2;
    if (/دوام|عمل/.test(text)) scores.work += 1.2;
  }

  let intent = 'general';
  let best = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > best) {
      best = v;
      intent = k;
    }
  }

  const confidence = Number(Math.min(1, best / 2.5).toFixed(2));
  if (best === 0) intent = 'general';
  return { intent, confidence, signals: signals.slice(0, 12) };
}

/**
 * Async hybrid detection: keyword first, then an optional AI classifier when
 * the signal is weak. Used by the ACE inspector; the chat pipeline uses the
 * fast synchronous detectIntent().
 * @returns {Promise<{ intent: string, confidence: number, signals: string[] }>}
 */
export async function detectIntentHybrid(message = '', { mode = 'general' } = {}) {
  const keyword = detectIntent(message, { mode });
  if (keyword.confidence >= 0.45 || !aiClassifier) return keyword;
  try {
    const r = await aiClassifier(message);
    if (r && ACE_INTENTS.includes(r.intent) && r.confidence > keyword.confidence) {
      return { intent: r.intent, confidence: Number(r.confidence.toFixed(2)), signals: [...keyword.signals, 'ai-classifier'] };
    }
  } catch {
    /* keep keyword result */
  }
  return keyword;
}
