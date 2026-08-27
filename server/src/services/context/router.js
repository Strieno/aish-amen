/**
 * ACE routing — maps an intent to the sources that matter for it.
 * Configurable map so new intents/sources are easy to add.
 */

export const INTENT_ROUTES = {
  study: {
    domains: ['memory', 'task', 'goal', 'study', 'focus', 'schedule', 'conversation'],
    limits: { memories: 15, tasks: 12, goals: 6, courses: 6, exams: 8, focus: 10, conversations: 3, schedule: 6 },
    guidance:
      'مساعدة دراسية عملية وقصيرة. اربط بالإجابة المواد والامتحانات القادمة والمهام المتعلقة بالدراسة. لا تشتت المستخدم بتفاصيل غير مرتبطة بالدراسة.',
    focus: 'study',
  },
  work: {
    domains: ['work', 'task', 'memory', 'conversation', 'schedule'],
    limits: { memories: 8, tasks: 10, notes: 10, shifts: 7, conversations: 3, schedule: 6 },
    guidance:
      'مساعدة عمل موجزة. استخدم المناوبات والملاحظات والمهام المتعلقة بالعمل. حافظ على خصوصية معلومات العمل.',
    focus: 'work',
  },
  planning: {
    domains: ['task', 'goal', 'study', 'work', 'focus', 'schedule', 'checkin'],
    limits: { tasks: 20, goals: 10, courses: 4, exams: 6, focus: 8, notes: 6, shifts: 5, checkins: 5, schedule: 10 },
    guidance:
      'خطة عملية قصيرة بأولويات واضحة وخطوة صغيرة أولى. لا تحول كل شيء إلى خطة من 30 خطوة.',
    focus: 'planning',
  },
  tasks: {
    domains: ['task', 'goal', 'schedule', 'focus', 'memory'],
    limits: { tasks: 20, goals: 6, schedule: 8, focus: 6, memories: 8 },
    guidance:
      'ركّز على المهام المفتوحة والأولويات والمواعيد القريبة. اقترح المهمة التالية الأكثر تأثيرًا.',
    focus: 'tasks',
  },
  goals: {
    domains: ['goal', 'task', 'memory', 'study', 'checkin'],
    limits: { goals: 10, tasks: 10, memories: 8, courses: 3, exams: 4, checkins: 4 },
    guidance:
      'اربط الرد بالأهداف النشطة وتقدمها وأقرب خطوة. لا تدفع المستخدم لتوسيع قائمة الأهداف.',
    focus: 'goals',
  },
  reflection: {
    domains: ['journal', 'memory', 'checkin', 'gratitude', 'safe_living'],
    limits: { journal: 10, memories: 12, checkins: 7, gratitude: 6, safe: 2 },
    guidance:
      'تأمل هادئ دون أحكام. لاحظ الأنماط بلطف دون تفاؤل زائف أو تعميمات. لا تشخيص.',
    focus: 'reflection',
  },
  memory: {
    domains: ['memory', 'journal', 'conversation', 'checkin'],
    limits: { memories: 20, journal: 6, conversations: 4, checkins: 4 },
    guidance:
      'أجب من ذاكرة المستخدم المتاحة فقط. إن لم تجد المعلومة فقل ذلك بوضوح ولا تخترعها.',
    focus: 'memory',
  },
  safe_living: {
    domains: ['safe_living', 'checkin', 'journal', 'task', 'memory'],
    limits: { safe: 4, checkins: 7, journal: 6, tasks: 8, memories: 10 },
    guidance:
      'إطار العيش الآمن: ما يحدث الآن، ما قد يعنيه، ما نعرفه/لا نعرفه، خطوة صغيرة مفيدة. لا تشجع على اجترار الأفكار ولا تشخيص.',
    focus: 'safe_living',
  },
  general: {
    domains: ['memory', 'task', 'goal', 'journal', 'checkin', 'study', 'work', 'focus', 'safe_living', 'conversation', 'schedule'],
    limits: { memories: 10, tasks: 8, goals: 6, journal: 5, checkins: 4, courses: 3, exams: 5, focus: 6, notes: 4, safe: 2, conversations: 3, schedule: 6 },
    guidance: 'أجب بإيجاز ووضوح، مستخدمًا أقل قدر من السياق الضروري للسؤال.',
    focus: 'general',
  },
};

export function getRoute(intent) {
  return INTENT_ROUTES[intent] || INTENT_ROUTES.general;
}
