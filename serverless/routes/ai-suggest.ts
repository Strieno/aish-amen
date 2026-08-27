import { authContext, buildCloudContext, generateText } from '../cloud-ai';

export const config = { maxDuration: 60 };

function fallbackSuggestion(context: any) {
  const tasks = Array.isArray(context?.data?.tasks)
    ? context.data.tasks.filter((task: any) => !['done', 'cancelled'].includes(String(task?.status || '')))
    : [];
  const exams = Array.isArray(context?.data?.exams) ? context.data.exams : [];
  const goals = Array.isArray(context?.data?.goals)
    ? context.data.goals.filter((goal: any) => String(goal?.status || '') === 'active')
    : [];

  const task = tasks[0];
  const exam = exams[0];
  const goal = goals[0];

  if (task?.title) return `ابدأ اليوم بالمهمة: «${String(task.title).slice(0, 120)}». اجعل أول خطوة صغيرة وواضحة ثم قيّم بقية يومك بعدها.`;
  if (exam?.title) return `الأولوية الأنسب الآن هي التحضير لـ «${String(exam.title).slice(0, 120)}». ابدأ بجلسة قصيرة على أكثر جزء يحتاج مراجعة.`;
  if (goal?.title) return `اختر خطوة صغيرة اليوم تدفع هدفك «${String(goal.title).slice(0, 120)}» للأمام بدل محاولة إنجاز أشياء كثيرة معًا.`;
  return 'لا توجد بيانات كافية الآن لبناء اقتراح شخصي قوي. أضف مهمة أو موعدًا أو هدفًا، ثم جرّب الاقتراح الذكي مرة أخرى.';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ error: 'Authentication required' });

    const context = await buildCloudContext(ctx, {
      message: 'ما أهم اقتراح عملي واحد لليوم؟',
      mode: 'planning',
      page: 'today',
    });

    try {
      const result = await generateText([
        {
          role: 'system',
          content: 'أعط اقتراحًا واحدًا فقط لليوم بالعربية، في جملتين كحد أقصى. استخدم بيانات السياق فقط، واذكر خطوة عملية محددة. لا تشرح كثيرًا.',
        },
        { role: 'user', content: context.text.slice(0, 7000) },
      ], {
        maxTokens: 180,
        temperature: 0.3,
        timeoutMs: 50000,
      });

      if (result.content) {
        return res.json({ ok: true, suggestion: result.content, fallback: false, model: result.model });
      }
    } catch (error) {
      console.error('[ai-suggest] DeepSeek attempt failed:', error instanceof Error ? error.message : error);
    }

    return res.json({
      ok: true,
      suggestion: fallbackSuggestion(context),
      fallback: true,
      model: 'fallback',
    });
  } catch (error) {
    console.error('[ai-suggest] context failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      ok: false,
      suggestion: '',
      fallback: true,
      error: error instanceof Error ? error.message : 'AI failed',
    });
  }
}
