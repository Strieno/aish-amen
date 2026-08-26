// Quick smoke test for the SSE streaming chat endpoint.
const BASE = 'http://localhost:4321/api';
const model = process.argv[2] || 'command-r7b-arabic:latest';

async function main() {
  // Set a default model so chat has something to use.
  await fetch(`${BASE}/settings/ai`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultModel: model }),
  });

  const started = Date.now();
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'مرحبًا، اكتب جملة واحدة قصيرة عن أهمية تنظيم اليوم.',
      assistant_id: 'asst-general',
    }),
  });
  console.log('status', res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let events = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      events += 1;
      const evLine = part.split('\n')[0].replace('event: ', '');
      const dataLine = part.split('\n').find((l) => l.startsWith('data: '))?.slice(6) || '';
      if (evLine === 'delta') full += JSON.parse(dataLine).delta;
      else if (evLine === 'done') console.log('DONE event:', dataLine.slice(0, 200));
      else if (evLine === 'error') console.log('ERROR event:', dataLine);
      else if (evLine === 'start') console.log('START event:', dataLine);
    }
  }
  console.log('events:', events, 'elapsed ms:', Date.now() - started);
  console.log('FULL RESPONSE:', full);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
