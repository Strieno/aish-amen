// Verify UX example #1: "What should I focus on tonight?" — the AI must
// autonomously connect the exam, task, and journal concern via LifeContextEngine.
const BASE = 'http://localhost:4321/api';
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { pass++; console.log(`  ✓ ${n}${extra ? ' — ' + extra : ''}`); } else { fail++; console.log(`  ✗ ${n}${extra ? ' — ' + extra : ''}`); } };

async function main() {
  console.log('LifeOS UX workflow test');
  const tag = Date.now().toString(36);

  // 1. Exam "Discrete Math Midterm — Sep 17"
  const course = await (await fetch(`${BASE}/courses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `الرياضيات المتقطعة ${tag}` }) })).json();
  const exam = await (await fetch(`${BASE}/exams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course_id: course.id, title: 'اختبار منتصف الفصل', exam_date: '2026-09-17' }) })).json();

  // 2. Task "Study inference rules"
  const task = await (await fetch(`${BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `مراجعة قواعد الاستنتاج ${tag}`, priority: 'high' }) })).json();

  // 3. Journal "I feel behind in discrete math"
  await fetch(`${BASE}/journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `قلق من مادة ${tag}`, content: `أشعر أنني متأخر في الرياضيات المتقطعة ${tag} والاختبار قريب`, entry_date: new Date().toISOString().slice(0, 10) }),
  });

  // 4. Ask the AI
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `ما الذي يجب أن أركز عليه الليلة؟`, mode: 'general' }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = ''; let full = ''; let doneInfo = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) {
      if (p.includes('event: delta')) full += JSON.parse(p.split('data: ')[1]).delta;
      if (p.includes('event: done')) doneInfo = JSON.parse(p.split('data: ')[1]);
    }
  }
  check('4. chat streams a reply', full.length > 10);

  const items = doneInfo?.contextUsed?.items || [];
  const types = items.map((i) => i.type);
  check('5. cross-domain context flows into reply', types.includes('task') && types.includes('journal') && /رياضيات|مادة|اختبار|امتحان|مراجعة|قواعد|تركيز/.test(full), items.map((i) => `${i.type}:${(i.title || '').slice(0, 20)}`).join(' | '));
  check('6. context includes the task', types.includes('task'));
  check('7. context includes the journal', types.includes('journal'));
  console.log('   reply:', full.slice(0, 220));

  // Course-specific query must retrieve the course (relevance ranking)
  const res2 = await fetch(`${BASE}/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `ماذا تعرف عن مادة ${tag}؟` }),
  });
  const reader2 = res2.body.getReader();
  let buf2 = ''; let doneInfo2 = null;
  while (true) {
    const { done, value } = await reader2.read();
    if (done) break;
    buf2 += decoder.decode(value, { stream: true });
    const parts = buf2.split('\n\n');
    buf2 = parts.pop();
    for (const p of parts) {
      if (p.includes('event: done')) doneInfo2 = JSON.parse(p.split('data: ')[1]);
    }
  }
  const items2 = doneInfo2?.contextUsed?.items || [];
  const types2 = items2.map((i) => i.type);
  check('8. course retrieved for course-specific query', types2.includes('course'), items2.filter((i) => i.type === 'course').map((i) => i.title.slice(0, 25)).join(' | '));

  // 5. AI action proposals after the exchange (chat → app)
  const prop = await (await fetch(`${BASE}/ai/propose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `أنهيت مراجعة الفصل الثالث من ${tag}` }) })).json();
  check('9. proposals generated', prop.ok && Array.isArray(prop.proposals), (prop.proposals || []).map((p) => p.type).join(','));
  const focusProp = (prop.proposals || []).find((p) => p.type === 'focus' || p.type === 'task');
  if (focusProp) {
    const exec = await (await fetch(`${BASE}/ai/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: focusProp }) })).json();
    check('10. proposal executed (chat → app write)', exec.ok && !!exec.entity);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
