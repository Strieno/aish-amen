// Test memory harvesting, chat import/export, folders, and AI categorization.
const BASE = 'http://localhost:4321/api';
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}`); } };

async function main() {
  console.log('Memory + chat sophistication test');

  // 1. Harvest from all fields
  const h1 = await (await fetch(`${BASE}/memory/harvest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  check('1. harvest scan runs', typeof h1.added === 'number');
  const h2 = await (await fetch(`${BASE}/memory/harvest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  check('2. harvest is idempotent (no duplicates)', h2.added === 0, h2.added);

  // 3. Task completion harvests a memory with source link
  const task = await (await fetch(`${BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `مهمة حصاد ${Date.now().toString(36)}` }) })).json();
  await fetch(`${BASE}/tasks/${task.id}/complete`, { method: 'POST' });
  const mems = await (await fetch(`${BASE}/memory?source=task`)).json();
  check('3. task completion → task memory', mems.some((m) => m.source_id === task.id));

  // 4. Source info resolves
  const srcMem = mems.find((m) => m.source_id === task.id);
  const srcInfo = await (await fetch(`${BASE}/memory/${srcMem.id}/source`)).json();
  check('4. memory source resolves', !!srcInfo.info && srcInfo.info.label.includes('مهمة'));

  // 5. Checkin harvests
  await fetch(`${BASE}/checkins/${new Date().toISOString().slice(0, 10)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ energy: 4, stress: 2, sleep_hours: 7 }) });
  const ck = await (await fetch(`${BASE}/memory?source=checkin`)).json();
  check('5. checkin → checkin memory', ck.length > 0);

  // 6. Folders CRUD
  const folder = await (await fetch(`${BASE}/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'الجامعة' }) })).json();
  check('6. create folder', !!folder.id);
  const conv = await (await fetch(`${BASE}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'محادثة تصنيف' }) })).json();
  await fetch(`${BASE}/conversations/${conv.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: 'الجامعة' }) });
  const folders = await (await fetch(`${BASE}/folders`)).json();
  check('7. folder counts conversations', folders.find((f) => f.id === folder.id)?.count >= 1);

  // 8. Export conversation
  const exp = await (await fetch(`${BASE}/conversations/${conv.id}/export`)).json();
  check('8. export conversation', exp.type === 'conversation' && Array.isArray(exp.messages));

  // 9. Import conversation (JSON)
  const imp = await (await fetch(`${BASE}/conversations/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: JSON.stringify([{ title: 'مستوردة 1', folder: 'الجامعة', tags: ['برمجة'], messages: [{ role: 'user', content: 'مرحبا' }, { role: 'assistant', content: 'أهلا' }] }]) }) })).json();
  check('9. import JSON conversation', imp.ok && imp.imported === 1);

  // 10. Import markdown conversation
  const md = `# محادثة من ملف\n\n**user:** ما هي الوراثة؟\n\n**assistant:** الوراثة تسمح باشتقاق فئة من أخرى.\n\n**user:** أعطني مثالاً\n**assistant:** السيارة من فئة المركبات.`;
  const impMd = await (await fetch(`${BASE}/conversations/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: md }) })).json();
  check('10. import markdown conversation', impMd.ok && impMd.imported === 1);
  const importedConv = await (await fetch(`${BASE}/conversations/${impMd.ids[0]}/messages`)).json();
  check('11. imported markdown has 4 messages', importedConv.length === 4);

  // 12. AI categorize
  const cat = await (await fetch(`${BASE}/conversations/${conv.id}/categorize`, { method: 'POST' })).json();
  check('12. AI categorize suggests folder+tags', cat.ok && (!!cat.suggested.folder || cat.suggested.tags.length > 0));
  console.log('   suggested:', JSON.stringify(cat.suggested));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
