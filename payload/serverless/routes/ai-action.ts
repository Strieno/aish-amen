import {
  authContext,
  buildCloudContext,
  generateText,
  parseJsonObject,
  readAllowed,
  sbInsert,
  sbSelect,
  uid,
  writeAllowed,
} from '../cloud-ai';

export const config = { maxDuration: 60 };

async function oneShot(system: string, user: string, maxTokens = 900) {
  const result = await generateText([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { maxTokens });
  return { ok: true, text: result.content, model: result.model, fallback: false };
}

function today() { return new Date().toISOString().slice(0, 10); }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authContext(req);
    if (!ctx) return res.status(401).json({ ok: false, error: 'Authentication required' });
    const body = req.body || {};
    const action = String(body.action || '');
    const common = await buildCloudContext(ctx, { message: String(body.text || body.question || action), mode: 'general' });
    const settings = common.settings;

    if (action === 'interpret') {
      const text = String(body.text || '').trim();
      if (!text) return res.json({ ok: false, error: 'لا يوجد نص' });
      const prompt = `حلّل النص وحدد النوع. أعد JSON فقط إذا كان task أو journal أو gratitude:\n{"kind":"task","title":"...","due":null,"priority":"high|medium|low","energy":"high|medium|low"}\nأو {"kind":"journal","title":"...","content":"..."}\nأو {"kind":"gratitude","items":["..."]}.\nإذا كان سؤالًا أعد {"kind":"question","answer":"رد مختصر ومفيد"}.`;
      const r = await generateText([{ role: 'system', content: prompt }, { role: 'user', content: text }], { maxTokens: 550, temperature: 0.2 });
      const json = parseJsonObject(r.content) || {};
      if (json.kind === 'task') return res.json({ ok: true, kind: 'task', suggestion: { title: json.title || text, due: json.due || null, priority: json.priority || 'medium', energy: json.energy || 'medium' }, fallback: false, model: r.model });
      if (json.kind === 'gratitude') return res.json({ ok: true, kind: 'gratitude', suggestion: { items: Array.isArray(json.items) ? json.items : [text] }, fallback: false, model: r.model });
      if (json.kind === 'journal') return res.json({ ok: true, kind: 'journal', suggestion: { title: json.title || text.slice(0, 30), content: json.content || text }, fallback: false, model: r.model });
      return res.json({ ok: true, kind: 'question', answer: json.answer || r.content, text: json.answer || r.content, fallback: false, model: r.model });
    }

    if (action === 'analyze-safe') {
      if (!readAllowed(settings, 'safe')) return res.json({ ok: false, error: 'قراءة العيش الآمن غير مسموحة للذكاء الاصطناعي', privacy: true });
      return res.json(await oneShot(`أنت مساعد "العيش الآمن". حلّل الموقف بهدوء وبدون تشخيص. استخدم: ما يحدث الآن، ما قد يعنيه، ما نعرفه/لا نعرفه، ما تحت السيطرة، وخطوة صغيرة الآن. لا تختلق معلومات.`, `${body.text || ''}\n\nسياق عيش آمن:\n${common.text}`, 1100));
    }

    if (action === 'journal-summary') {
      if (!readAllowed(settings, 'journal')) return res.json({ ok: false, error: 'قراءة اليوميات غير مسموحة للذكاء الاصطناعي', privacy: true });
      const rows = await sbSelect(ctx, 'journal_entries', { id: `eq.${body.journal_id}`, limit: 1 });
      const entry = rows[0];
      if (!entry) return res.json({ ok: false, error: 'الإدخال غير موجود' });
      if (entry.ai_access === false) return res.json({ ok: false, error: 'هذا الإدخال غير مسموح للذكاء الاصطناعي بقراءته', privacy: true });
      return res.json(await oneShot('لخّص إدخال اليوميات في سطرين ثم اذكر ملاحظة هادئة واحدة عن نمط واضح فقط. لا تحكم ولا تختلق.', `العنوان: ${entry.title}\nالتاريخ: ${entry.entry_date}\nالمزاج: ${entry.mood || '—'}\n\n${entry.content}`, 700));
    }

    if (action === 'tutor') {
      if (!readAllowed(settings, 'study')) return res.json({ ok: false, error: 'قراءة الدراسة غير مسموحة للذكاء الاصطناعي', privacy: true });
      const course = (await sbSelect(ctx, 'courses', { id: `eq.${body.course_id}`, limit: 1 }))[0];
      if (!course) return res.json({ ok: false, error: 'المادة غير موجودة' });
      const topics = await sbSelect(ctx, 'course_topics', { course_id: `eq.${course.id}`, order: 'created_at.asc', limit: 20 });
      const prompts: Record<string, string> = {
        explain: 'اشرح الموضوع ببساطة ووضوح، أعط مثالاً واحداً، ثم سؤال تحقق واحد.',
        quiz: 'اكتب 3 أسئلة اختيار من متعدد متدرجة الصعوبة. لا تعط الإجابات مباشرة.',
        flashcards: 'أنشئ 5 بطاقات مراجعة بصيغة **س:** ثم **ج:**.',
        practice: 'أعط تمرينين تطبيقيين مع تلميح بسيط لكل تمرين ولا تحلهما بالكامل.',
      };
      const system = `أنت مرشد دراسي جامعي داخل عيش آمن. ${prompts[String(body.mode)] || prompts.explain} استخدم العربية مع المصطلحات التقنية الإنجليزية.`;
      const user = `المادة: ${course.name}${course.code ? ` (${course.code})` : ''}\nالموضوعات: ${topics.map((x: any) => x.title).join('، ')}\nالمطلوب: ${body.question || 'اختر موضوعاً مهمًا من المادة.'}`;
      return res.json(await oneShot(system, user, 1300));
    }

    if (action === 'memory-suggest') {
      if (!readAllowed(settings, 'memories')) return res.json({ ok: false, error: 'قراءة الذاكرة غير مسموحة', privacy: true });
      const r = await generateText([
        { role: 'system', content: 'من سياق عيش آمن التالي استخرج حتى 5 ذكريات دائمة مفيدة. أعد JSON فقط: {"memories":[{"content":"...","type":"preference|general|episodic|semantic|project","importance":0.5}]}. لا تكرر تفاصيل عابرة.' },
        { role: 'user', content: common.text.slice(0, 18000) },
      ], { maxTokens: 1000, temperature: 0.2 });
      const json = parseJsonObject(r.content) || {};
      const candidates = (Array.isArray(json.memories) ? json.memories : []).filter((m: any) => m?.content).slice(0, 5).map((m: any) => ({ content: String(m.content).trim(), type: m.type || 'general', importance: Number(m.importance) || 0.5 }));
      return res.json({ ok: true, candidates, fallback: false, model: r.model });
    }

    if (action === 'memory-save') {
      if (!writeAllowed(settings, 'memories')) return res.json({ ok: false, error: 'الكتابة إلى الذاكرة غير مسموحة', privacy: true });
      const c = body.candidate || {};
      if (!c.content) return res.json({ ok: false, error: 'لا يوجد محتوى' });
      const memory = await sbInsert(ctx, 'memories', { id: uid('mem-'), content: c.content, type: c.type || 'general', importance: c.importance ?? 0.5, source: 'ai-suggestion', source_type: 'ai', source_id: null, confidence: 0.6, tags: [], pinned: false, archived: false, ai_access: true });
      return res.json({ ok: true, memory });
    }

    if (action === 'insights-summary') {
      return res.json(await oneShot('حلّل سياق المستخدم وصفياً دون ادعاء سببية. اكتب فقرة واحدة بحد أقصى 6 أسطر تربط أهم الملاحظات العملية.', common.text, 750));
    }

    if (action === 'goal-review') {
      const goal = (await sbSelect(ctx, 'goals', { id: `eq.${body.goal_id}`, limit: 1 }))[0];
      if (!goal) return res.json({ ok: false, error: 'الهدف غير موجود' });
      const milestones = await sbSelect(ctx, 'goal_milestones', { goal_id: `eq.${goal.id}`, order: 'created_at.asc', limit: 30 });
      const projects = await sbSelect(ctx, 'projects', { goal_id: `eq.${goal.id}`, limit: 20 });
      return res.json(await oneShot('راجع الهدف وتقدمه ثم اقترح خطوة واحدة واقعية قابلة للتنفيذ هذا الأسبوع. بحد أقصى 5 أسطر.', `الهدف: ${goal.title}\nالمجال: ${goal.life_area || 'عام'}\nالتاريخ: ${goal.target_date || 'غير محدد'}\nالتقدم: ${Math.round(Number(goal.progress || 0) * 100)}%\nالمراحل: ${milestones.map((m: any) => `${m.done ? '✓' : '○'} ${m.title}`).join(' | ')}\nالمشاريع: ${projects.map((p: any) => p.name).join('، ')}`, 650));
    }

    if (action === 'plan-day') {
      return res.json(await oneShot('أنشئ خطة يوم واقعية مرتبة حسب الأولوية، بحد أقصى 8 بنود، مع تلميح راحة واحد. استخدم بيانات عيش آمن فقط.', common.text, 900));
    }

    if (action === 'next-task') {
      const open = (common.data.tasks || []).filter((t: any) => !['done', 'cancelled'].includes(t.status)).slice(0, 20);
      const list = open.length ? open.map((t: any) => `- [${t.priority}] ${t.title}${t.due_date ? ` | ${t.due_date}` : ''}${t.est_minutes ? ` | ${t.est_minutes}د` : ''}`).join('\n') : 'لا توجد مهام.';
      return res.json(await oneShot('اختر مهمة واحدة فقط هي الأهم الآن من القائمة، ثم أعط سببًا مختصرًا في سطر واحد.', list, 350));
    }

    if (action === 'synthesize') {
      return res.json(await oneShot(`قدّم توليفة منظمة للفترة المطلوبة (${body.period || 'week'}, ${body.days || 7} أيام): ما مضى جيدًا، ما يحتاج انتباهًا، أنماط حذرة، و2-3 خطوات قادمة. لا تختلق بيانات.`, common.text, 1200));
    }

    if (action === 'save-synthesis') {
      const text = String(body.text || '').trim();
      if (!text) return res.json({ ok: false, error: 'لا يوجد نص' });
      if (body.kind === 'memory') {
        if (!writeAllowed(settings, 'memories')) return res.json({ ok: false, error: 'الكتابة إلى الذاكرة غير مسموحة', privacy: true });
        const memory = await sbInsert(ctx, 'memories', { id: uid('mem-'), content: text.slice(0, 1000), type: 'general', importance: 0.6, source: 'synthesis', source_type: 'ai', confidence: 0.7, tags: [], pinned: false, archived: false, ai_access: true });
        return res.json({ ok: true, entity: { type: 'memory', id: memory.id } });
      }
      if (!writeAllowed(settings, 'journal')) return res.json({ ok: false, error: 'الكتابة إلى اليوميات غير مسموحة', privacy: true });
      const journal = await sbInsert(ctx, 'journal_entries', { id: uid('journal-'), title: `ملخص ${body.kind === 'week' ? 'الأسبوع' : 'اليوم'}`, content: text, entry_date: today(), tags: [], mood: null, ai_access: true });
      return res.json({ ok: true, entity: { type: 'journal', id: journal.id } });
    }

    return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'AI action failed', fallback: true });
  }
}
