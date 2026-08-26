const BASE = 'http://localhost:4321/api';
async function main() {
  const convs = await (await fetch(`${BASE}/conversations`)).json();
  console.log('conversations:', convs.length);
  const c = convs[0];
  console.log('first conv:', c.id, 'title length:', (c.title || '').length);
  const msgs = await (await fetch(`${BASE}/conversations/${c.id}/messages`)).json();
  console.log('messages:', msgs.length);
  const assistant = msgs.find((m) => m.role === 'assistant');
  const meta = assistant ? JSON.parse(assistant.metadata || '{}') : {};
  console.log('contextUsed keys:', Object.keys(meta.contextUsed || {}));
  console.log('fallback flag:', meta.fallback);
  // memory search test
  const mems = await (await fetch(`${BASE}/memory/search?q=تنظيم`)).json();
  console.log('memory search results:', mems.length);
  const daily = await (await fetch(`${BASE}/ai/daily-summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  console.log('daily summary:', JSON.stringify(daily.summary));
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
