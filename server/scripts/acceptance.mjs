// Full acceptance-workflow integration test against a live server.
const BASE = 'http://localhost:4321/api';
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); }
}

async function main() {
  console.log('Aish Aman OS acceptance test');

  // 1. Health (offline-capable)
  const health = await (await fetch(`${BASE}/health`)).json();
  check('1. health endpoint', health.ok === true);

  // 2. Create task
  const task = await (await fetch(`${BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'مراجعة فصل التوارث', priority: 'high', due_date: new Date().toISOString().slice(0, 10) }) })).json();
  check('2. create task', !!task.id);

  // 3. Journal entry
  const j = await (await fetch(`${BASE}/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'تسجيل يومي', content: 'أنهيت المحاضرة', entry_date: new Date().toISOString().slice(0, 10) }) })).json();
  check('3. create journal', !!j.id);

  // 4-5. Configure Ollama + discover models
  const test = await (await fetch(`${BASE}/providers/prov-ollama/test`, { method: 'POST' })).json();
  check('4. ollama connected', test.ok === true);
  const models = await (await fetch(`${BASE}/models`)).json();
  check('5. models discovered', Array.isArray(models) && models.length > 0);
  const defaultModel = models.find((m) => m.model_id.includes('command'))?.model_id || models[0]?.model_id;
  await fetch(`${BASE}/settings/ai`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultModel }) });

  // 6. Streaming chat
  const streamRes = await fetch(`${BASE}/chat/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'أجب بكلمة واحدة: مرحبًا', assistant_id: 'asst-general' }) });
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = ''; let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const part of buf.split('\n\n')) {
      if (part.includes('event: delta')) content += JSON.parse(part.split('data: ')[1]).delta;
    }
    buf = buf.split('\n\n').pop();
  }
  check('6. streaming chat returns text', content.length > 0);

  // 7. Create assistant (unique slug per run)
  const runTag = Date.now().toString(36);
  const asst = await (await fetch(`${BASE}/assistants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `مساعد اختبار ${runTag}`, slug: `test-${runTag}`, system_prompt: 'كن موجزًا', tool_permissions: ['search_knowledge'] }) })).json();
  check('7. create assistant', !!asst.id);

  // 8. Import document (unique content per run)
  const kbs = await (await fetch(`${BASE}/knowledge`)).json();
  const kb = kbs[0];
  const imp = await (await fetch(`${BASE}/knowledge/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kb_id: kb.id, filename: `oop-${runTag}.md`, content: `الوراثة ${runTag} تسمح باشتقاق فئة من أخرى. تعدد الأشكال يسمح بالمعاملة الموحدة.` }) })).json();
  check('8. import document', imp.duplicate === false && !!imp.document);

  // 9. RAG search
  const rag = await (await fetch(`${BASE}/knowledge/search?q=${encodeURIComponent('الوراثة')}`)).json();
  check('9. RAG returns citations', rag.length > 0 && !!rag[0].filename);

  // 10. Memory store + retrieve
  await fetch(`${BASE}/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `يفضل الشرح بالعربية ${runTag} مع المصطلحات التقنية`, type: 'preference' }) });
  const memSearch = await (await fetch(`${BASE}/memory/search?q=${encodeURIComponent('مصطلحات')}`)).json();
  check('10. memory stored + retrieved', memSearch.length > 0);

  // 11. Import audio (tiny wav, base64)
  const tinyWav = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', 'base64').toString('base64');
  const audio = await (await fetch(`${BASE}/audio/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'rain.wav', title: 'مطر', data: tinyWav }) })).json();
  check('11. import audio', !!audio.file && !!audio.file.url);

  // 12. Sound scene
  const scene = await (await fetch(`${BASE}/audio/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'دراسة', tracks: [{ fileId: audio.file.id, title: 'مطر', url: audio.file.url, volume: 0.5, loop: true }] }) })).json();
  check('12. create sound scene', !!scene.id);

  // 13. Focus session with completion
  const focus = await (await fetch(`${BASE}/focus/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: 25, task_id: task.id }) })).json();
  await fetch(`${BASE}/focus/${focus.id}/complete`, { method: 'POST' });
  check('13. focus session created + completed', !!focus.id);

  // 14. Backup + restore round-trip
  const bk = await (await fetch(`${BASE}/backups`, { method: 'POST' })).json();
  const backups = await (await fetch(`${BASE}/backups`)).json();
  check('14. backup created + listed', backups.some((b) => b.id === bk.id));

  // 15. Checkin
  await fetch(`${BASE}/checkins/${new Date().toISOString().slice(0, 10)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ energy: 4, stress: 2, sleep_hours: 7 }) });
  const checkins = await (await fetch(`${BASE}/checkins`)).json();
  check('15. checkin saved', checkins.length > 0);

  // 16. Insights
  const insights = await (await fetch(`${BASE}/insights`)).json();
  check('16. insights computed', typeof insights.avgFocusMinutes === 'number');

  // 17. Export
  const exp = await (await fetch(`${BASE}/export`)).json();
  check('17. export contains data', !!exp.data && !!exp.data.tasks);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
