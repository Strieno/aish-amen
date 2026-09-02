/**
 * Local command router — the "what do you want to do?" input understands
 * natural, short commands without a round-trip to the AI model. Anything it
 * doesn't recognize falls through to the AI `interpret` action.
 */

export type CommandKind =
  | 'plan'
  | 'next'
  | 'calm'
  | 'urgent'
  | 'focus'
  | 'theme'
  | 'task-add'
  | 'note-add'
  | 'gratitude-add'
  | 'exam-add'
  | 'chat'
  | 'interpret';

export interface CommandMatch {
  kind: CommandKind;
  /** The user's original text. */
  text: string;
  /** Extracted payload (task title, question, …) or ''. */
  payload: string;
}

const RULES: { kind: CommandKind; re: RegExp }[] = [
  { kind: 'urgent', re: /(العاجل فقط|فقط العاجل|العاجل|الملح|الضروري فقط|عرض العاجل|urgent only|only urgent|urgent)/i },
  { kind: 'calm', re: /(بسّط|بسط|خفّف اليوم|خفف اليوم|بسّط مهامي|بسط مهامي|الوضع الهادئ|وضع هادئ|simplify|calm mode|declutter|هدوء)/i },
  { kind: 'plan', re: /(خطّط|خطط|نظّم يومي|نظم يومي|نظّم دراستي|نظم دراستي|نظّم مسائي|خطط مسائي|نظم مسائي|plan my|organize my|رتب يومي|رتّب يومي)/i },
  { kind: 'next', re: /(ماذا أفعل الآن|ما أهم شيء|ما هو الأهم|وش أسوي|أهم مهمة|what should i do|what now|next best)/i },
  { kind: 'focus', re: /(جلسة تركيز|بدء تركيز|ابدأ تركيز|تركيز|بومودورو|pomodoro|focus session|start focus)/i },
  { kind: 'theme', re: /(الوضع الداكن|الداكن|الوضع الليلي|الليلي|الوضع الفاتح|الفاتح|الوضع النهاري|dark mode|light mode|toggle theme|تبديل الثيم)/i },
  { kind: 'exam-add', re: /(امتحان|اختبار|اختبار في|exam on|add exam|جدول امتحان)/i },
  { kind: 'task-add', re: /^(أضف|اضف|أضيف|اضيف|add)\s+(مهمة|مهمه|task)|^(مهمة|مهمه|task)\s+/i },
  { kind: 'note-add', re: /^(أضف|اضف|أضيف|add)\s+(ملاحظة|ملحوظة|note)|^(ملاحظة|ملحوظة|note)\s+/i },
  { kind: 'gratitude-add', re: /^(أضف|اضف|add)\s+(امتنان|gratitude)|^امتنان|^gratitude|(أشكر|امتنان ل)/i },
  { kind: 'chat', re: /(اسأل|اشرح|شرح|لخّص|لخص|سؤال|question|ask|explain|summarize|متى|كيف|لماذا|هل|ما هو|ما هي)/i },
];

export function matchCommand(input: string): CommandMatch {
  const text = input.trim();
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      return { kind: rule.kind, text, payload: extractPayload(rule.kind, text) };
    }
  }
  return { kind: 'interpret', text, payload: text };
}

/** Small helpers to extract the useful part of a command. */
function extractPayload(kind: CommandKind, text: string): string {
  const clean = (t: string) =>
    t
      .replace(/^(أضف|اضف|أضيف|add|خطط لي|خطط|نظم|نظّم)\s+/i, '')
      .replace(/^(مهمة|مهمه|task|ملاحظة|ملحوظة|note)\s*[:\-]?\s*/i, '')
      .trim();
  switch (kind) {
    case 'task-add':
    case 'note-add':
    case 'exam-add':
    case 'chat':
      return clean(text);
    default:
      return '';
  }
}

export const COMMAND_EXAMPLES_AR = ['خطّط مسائي', 'نظّم دراستي', 'ماذا أفعل الآن؟', 'أضف مهمة شراء حليب', 'بسّط اليوم', 'العاجل فقط'];
export const COMMAND_EXAMPLES_EN = ['Plan my evening', 'Organize my studies', 'What should I do now?', 'Add task buy milk', 'Simplify today', 'Urgent only'];
