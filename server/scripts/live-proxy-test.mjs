// Test SSE through the Vite dev proxy (port 5173) — the real dev flow.
const BASE = 'http://localhost:5173/api';
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}`); } };

async function main() {
  console.log('Live SSE via Vite proxy test');
  const res = await fetch(`${BASE}/events/stream`);
  check('1. stream opens via proxy', res.ok);
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
        if (p.startsWith('data: ') && p.includes('event_type')) {
          try { received.push(JSON.parse(p.slice(6))); } catch { /* ignore */ }
        }
      }
    }
  };

  await collect(400);
  await fetch(`${BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `عبر البروكسي ${Date.now().toString(36)}` }) });
  await collect(1500);
  check('2. event received through proxy', received.some((e) => e.event_type === 'TaskCreated'));

  // Smarter cross-domain AI suggestion
  const s = await (await fetch(`${BASE}/ai/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  check('3. smart cross-domain insight generated', !!s.suggestion, s.suggestion?.slice(0, 120));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
