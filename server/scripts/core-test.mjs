const BASE = 'http://localhost:4321/api';
async function main() {
  // Memory
  const mem = await (await fetch(`${BASE}/memory`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'يفضل شرح المفاهيم بالعربية مع المصطلحات التقنية بالإنجليزية', type: 'preference', importance: 0.9, tags: ['study'] }),
  })).json();
  console.log('created memory:', mem.id);
  const memSearch = await (await fetch(`${BASE}/memory/search?q=مصطلحات`)).json();
  console.log('memory search hits:', memSearch.length);

  // Knowledge
  const kb = await (await fetch(`${BASE}/knowledge`)).json();
  const kbId = kb.find((b) => b.name === 'البرمجة').id;
  console.log('kb:', kbId);
  const imp = await (await fetch(`${BASE}/knowledge/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kb_id: kbId, filename: 'oop-notes.md', content: 'الوراثة Inheritance تسمح للفئة بالاشتقاق من فئة أخرى. تعدد الأشكال Polymorphism يسمح بمعاملة كائنات مختلفة بنفس الواجهة.' }),
  })).json();
  console.log('import duplicate?', imp.duplicate, 'doc id:', imp.document?.id);
  const rag = await (await fetch(`${BASE}/knowledge/search?q=الوراثة`)).json();
  console.log('RAG results:', rag.length, 'first:', rag[0]?.filename);

  // Backup
  const bk = await (await fetch(`${BASE}/backups`, { method: 'POST' })).json();
  console.log('backup created:', bk.id);
  const backups = await (await fetch(`${BASE}/backups`)).json();
  console.log('backups listed:', backups.length);
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
