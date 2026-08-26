// Test the live SSE event stream: subscribe, trigger mutations, verify events arrive.
const BASE = 'http://localhost:4321/api';
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { pass++; console.log(`  ✓ ${n}${extra ? ' — ' + extra : ''}`); } else { fail++; console.log(`  ✗ ${n}${extra ? ' — ' + extra : ''}`); } };

async function main() {
  console.log('Live events stream test');
  const res = await fetch(`${BASE}/events/stream`);
  check('1. stream opens', res.ok && res.headers.get('content-type')?.includes('text/event-stream'));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const received = [];
  let buf = '';
  const collect = async (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts) {
        if (p.startsWith('data: ') && p !== 'data: {"ts"') {
          try {
            const ev = JSON.parse(p.slice(6));
            if (ev.event_type) received.push(ev);
          } catch { /* ignore */ }
        }
      }
    }
  };

  // Trigger mutations while listening
  await collect(500);
  const task = await (await fetch(`${BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `حدث مباشر ${Date.now().toString(36)}` }) })).json();
  await collect(1200);
  check('2. TaskCreated event received', received.some((e) => e.event_type === 'TaskCreated' && e.entity_type === 'task'));

  await fetch(`${BASE}/tasks/${task.id}/complete`, { method: 'POST' });
  await collect(1200);
  check('3. TaskCompleted event received', received.some((e) => e.event_type === 'TaskCompleted'));

  await fetch(`${BASE}/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'يوميات مباشرة', content: 'اختبار', entry_date: new Date().toISOString().slice(0, 10) }) });
  await collect(1200);
  check('4. JournalEntryCreated received', received.some((e) => e.event_type === 'JournalEntryCreated'));

  await fetch(`${BASE}/focus/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: 25 }) });
  await collect(1200);
  check('5. events carry entity_type', received.every((e) => 'event_type' in e && 'entity_type' in e));

  console.log(`   received ${received.length} events`);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
