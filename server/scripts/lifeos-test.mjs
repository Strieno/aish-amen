// Test LifeOS backend: context engine, links, timeline, graph, search, proposals, smart context.
const BASE = 'http://localhost:4321/api';
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { pass++; console.log(`  ✓ ${n}${extra ? ' — ' + extra : ''}`); } else { fail++; console.log(`  ✗ ${n}${extra ? ' — ' + extra : ''}`); } };

async function main() {
  console.log('LifeOS integration test');
  const tag = Date.now().toString(36);

  // Seed data
  const course = await (await fetch(`${BASE}/courses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `الرياضيات المتقطعة ${tag}` }) })).json();
  const exam = await (await fetch(`${BASE}/exams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course_id: course.id, title: 'اختبار منتصف الفصل', exam_date: '2026-09-17' }) })).json();
  const task = await (await fetch(`${BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `مراجعة قواعد الاستنتاج ${tag}`, priority: 'high' }) })).json();
  const journal = await (await fetch(`${BASE}/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'قلق من الاختبار', content: `أشعر أنني متأخر في ${tag} والاختبار قريب`, entry_date: new Date().toISOString().slice(0, 10) }) })).json();

  // 1. Entity links auto-discovery (journal mentions exam keywords)
  await fetch(`${BASE}/links/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'journal', id: journal.id }) });
  const relatedJ = await (await fetch(`${BASE}/related/journal/${journal.id}`)).json();
  check('1. journal has related entities', relatedJ.related.length > 0, `${relatedJ.related.length} related`);

  // 2. Manual link + dedupe
  const l1 = await (await fetch(`${BASE}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_type: 'task', source_id: task.id, target_type: 'exam', target_id: exam.id, relationship_type: 'supports' }) })).json();
  const l2 = await (await fetch(`${BASE}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_type: 'task', source_id: task.id, target_type: 'exam', target_id: exam.id, relationship_type: 'supports' }) })).json();
  check('2. link created + deduped', l1.link && !l2.link);

  // 3. Related with why
  const relatedT = await (await fetch(`${BASE}/related/task/${task.id}`)).json();
  check('3. task related shows relationship', relatedT.related.some((r) => r.relationship_type === 'supports'));

  // 4. Timeline (cross-domain, chronological)
  const tl = await (await fetch(`${BASE}/timeline?days=30`)).json();
  check('4. timeline has events', Array.isArray(tl) && tl.length > 0, `${tl.length} events`);
  const tlStudy = await (await fetch(`${BASE}/timeline?days=30&domains=study,tasks,journal`)).json();
  check('5. timeline domain filter', tlStudy.some((e) => e.event_type === 'ExamGradeRecorded') || tlStudy.some((e) => e.event_type === 'JournalEntryCreated') || tlStudy.some((e) => e.event_type === 'TaskCreated'));

  // 5. Activity backfill idempotent
  const b1 = await (await fetch(`${BASE}/timeline?days=90`)).json();
  check('6. activity events indexed', b1.length > 0);

  // 6. Universal search
  const search = await (await fetch(`${BASE}/search?q=${encodeURIComponent(tag)}`)).json();
  check('7. universal search finds multiple modules', search.groups.length >= 2, search.groups.map((g) => g.type).join(','));

  // 7. Graph
  const graph = await (await fetch(`${BASE}/graph`)).json();
  check('8. graph seed returns nodes+edges', Array.isArray(graph.nodes) && Array.isArray(graph.edges) && graph.nodes.length > 0, `${graph.nodes.length} nodes`);
  const ego = await (await fetch(`${BASE}/graph?entity_type=exam&entity_id=${exam.id}`)).json();
  check('9. graph ego-network centers on exam', ego.center === `exam:${exam.id}`, `${ego.nodes.length} nodes`);

  // 8. Smart context
  const sc = await (await fetch(`${BASE}/smart-context?page=study`)).json();
  check('10. smart context returns structured data', Array.isArray(sc.tasks) && Array.isArray(sc.deadlines) && Array.isArray(sc.memories));
  const scFocused = await (await fetch(`${BASE}/smart-context?page=study&focus_type=course&focus_id=${course.id}`)).json();
  check('11. smart context focus mode', !!scFocused.focus);

  // 9. Entity preview
  const prev = await (await fetch(`${BASE}/entities/preview?type=exam&id=${exam.id}`)).json();
  check('12. entity preview works', prev.title && prev.title.length > 0);

  // 10. AI proposals + execution
  const prop = await (await fetch(`${BASE}/ai/propose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `أنهيت مراجعة الفصل الثالث من ${tag}` }) })).json();
  check('13. AI proposes structured actions', prop.ok && Array.isArray(prop.proposals), prop.proposals?.map((p) => p.type).join(','));
  if (prop.proposals?.length) {
    const exec = await (await fetch(`${BASE}/ai/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: prop.proposals[0] }) })).json();
    check('14. proposal executes + creates entity', exec.ok && !!exec.entity, `${exec.entity?.type}:${exec.entity?.id?.slice(0, 10)}`);
  }

  // 11. Conversation mode + pinned context
  const conv = await (await fetch(`${BASE}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'محادثة سياق', mode: 'university' }) })).json();
  const conv2 = await (await fetch(`${BASE}/conversations/${conv.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'work' }) })).json();
  check('15. conversation mode persists', conv2.mode === 'work');
  await fetch(`${BASE}/conversations/${conv.id}/context`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ type: 'exam', id: exam.id }] }) });
  const pinned = await (await fetch(`${BASE}/conversations/${conv.id}/context`)).json();
  check('16. pinned context persists', pinned.length === 1 && pinned[0].type === 'exam');

  // 12. Context modes list
  const modes = await (await fetch(`${BASE}/ai/context-modes`)).json();
  check('17. context modes listed', Array.isArray(modes) && modes.includes('university'));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
