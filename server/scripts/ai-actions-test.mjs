// Test contextual AI actions + streaming assist.
const BASE = 'http://localhost:4321/api';
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}`); } };

async function action(name, payload) {
  const r = await fetch(`${BASE}/ai/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: name, ...payload }),
  });
  return r.json();
}

async function main() {
  console.log('AI integration test');
  const t0 = Date.now();

  const interp = await action('interpret', { text: 'اشتري قهوة غداً' });
  check(`interpret → task (${Date.now() - t0}ms)`, interp.ok && interp.kind === 'task' && !!interp.suggestion?.title);
  console.log('   suggestion:', JSON.stringify(interp.suggestion));

  const interp2 = await action('interpret', { text: 'أشعر بالإرهاق بعد العمل اليوم' });
  check('interpret → journal', interp2.ok && interp2.kind === 'journal');

  const j = await (await fetch(`${BASE}/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'اختبار ملخص', content: 'اليوم أنهيت المحاضرة مبكراً وشعرت بتحسن، ثم مشيت نصف ساعة في الهواء الطلق', entry_date: new Date().toISOString().slice(0, 10) }) })).json();
  const sum = await action('journal-summary', { journal_id: j.id });
  check('journal-summary', sum.ok && sum.text.length > 10);
  console.log('   summary:', sum.text?.slice(0, 120));

  const course = await (await fetch(`${BASE}/courses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `ذكاء اصطناعي ${Date.now().toString(36)}` }) })).json();
  const tut = await action('tutor', { course_id: course.id, mode: 'quiz', question: 'الشبكات العصبية' });
  check('tutor quiz', tut.ok && tut.text.length > 20);

  const safe = await action('analyze-safe', { text: 'أقلق من التأخر عن الدوام غداً بسبب الزحام' });
  check('analyze-safe', safe.ok && safe.text.length > 20);
  console.log('   safe:', safe.text?.slice(0, 100));

  const mems = await action('memory-suggest');
  check('memory-suggest returns candidates array', Array.isArray(mems.candidates));
  if (mems.candidates?.length) {
    const saved = await action('memory-save', { candidate: mems.candidates[0] });
    check('memory-save', saved.ok && !!saved.memory?.id);
  }

  const ins = await action('insights-summary');
  check('insights-summary', ins.ok);

  const day = await action('plan-day');
  check('plan-day', day.ok && day.text.length > 10);

  const nxt = await action('next-task');
  check('next-task', nxt.ok && nxt.text.length > 5);

  // Streaming assist
  const res = await fetch(`${BASE}/ai/assist/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 'today', message: 'لخص لي أهم شيء اليوم في سطر واحد' }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = ''; let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) {
      if (p.includes('event: delta')) content += JSON.parse(p.split('data: ')[1]).delta;
    }
  }
  check('assist/stream returns text', content.length > 5);
  console.log('   assist:', content.slice(0, 120));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
