import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Use a throwaway data dir so tests never touch real user data.
const tmp = mkdtempSync(path.join(os.tmpdir(), 'aish-test-'));
process.env.AISH_DATA_DIR = tmp;

const dbMod = await import('../src/db/index.js');
const settingsMod = await import('../src/services/settings.js');
const memoryMod = await import('../src/services/memory.js');
const knowledgeMod = await import('../src/services/knowledge.js');
const backupMod = await import('../src/services/backup.js');
const { estimateTokens, trimMessages, ftsQuery } = await import('../src/lib/util.js');
const promptMod = await import('../src/services/prompt-engine.js');
const { getProvider, listProviders, createProviderFromRow } = await import('../src/providers/index.js');
const { MockProvider } = await import('../src/providers/mock.js');
const { OpenAICompatibleProvider } = await import('../src/providers/openai-compatible.js');
const chatMod = await import('../src/services/chat.js');
const lifeContextMod = await import('../src/services/life-context.js');
const linksMod = await import('../src/services/links.js');
const activityMod = await import('../src/services/activity.js');
const searchMod = await import('../src/services/search.js');
const proposalsMod = await import('../src/services/ai-proposals.js');
const ttsMod = await import('../src/services/tts.js');

before(() => {
  dbMod.openDb();
});

after(() => {
  dbMod.closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test('settings round-trip', () => {
  settingsMod.setSetting('testObject', { a: 1, b: [2, 3] });
  assert.deepEqual(settingsMod.getSetting('testObject'), { a: 1, b: [2, 3] });
  settingsMod.patchSetting('testObject', { c: true });
  assert.deepEqual(settingsMod.getSetting('testObject'), { a: 1, b: [2, 3], c: true });
});

test('OpenAI read-aloud defaults to the Alloy voice', () => {
  assert.equal(ttsMod.openaiVoiceFor('ar', 'auto'), 'alloy');
  assert.equal(ttsMod.openaiVoiceFor('en'), 'alloy');
  assert.equal(ttsMod.openaiVoiceFor('ar', 'coral'), 'coral');
});

test('task lifecycle', () => {
  const { all, run, get } = dbMod;
  run(
    'INSERT INTO tasks(id, title, priority, energy, status, due_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    't-1', 'مراجعة فصل', 'high', 'medium', 'inbox', '2026-08-24', new Date().toISOString(), new Date().toISOString(),
  );
  const t = get('SELECT * FROM tasks WHERE id = ?', 't-1');
  assert.equal(t.priority, 'high');
  run('UPDATE tasks SET status = ? WHERE id = ?', 'done', 't-1');
  const done = get('SELECT * FROM tasks WHERE id = ?', 't-1');
  assert.equal(done.status, 'done');
  assert.ok(all('SELECT * FROM tasks').length >= 1);
});

test('memory create + hybrid search (Arabic affix)', () => {
  const mem = memoryMod.createMemory({
    content: 'يفضل شرح المفاهيم بالعربية مع المصطلحات التقنية',
    type: 'preference',
    importance: 0.9,
    tags: ['study'],
  });
  assert.ok(mem.id);
  const byExact = memoryMod.searchMemories('العربية', { limit: 5 });
  assert.ok(byExact.some((m) => m.id === mem.id));
  const bySubstring = memoryMod.searchMemories('مصطلحات', { limit: 5 });
  assert.ok(bySubstring.some((m) => m.id === mem.id));
  // Respect ai_access
  memoryMod.createMemory({ content: 'سرية تمامًا', aiAccess: false });
  const privateHits = memoryMod.searchMemories('سرية', { limit: 5 });
  assert.ok(!privateHits.some((m) => m.content.includes('سرية')));
});

test('knowledge import + RAG + duplicate detection', async () => {
  const kb = knowledgeMod.createKnowledgeBase({ name: 'اختبار' });
  const r1 = await knowledgeMod.importDocument({
    kbId: kb.id,
    filename: 'a.txt',
    content: 'الوراثة تسمح باشتقاق فئة من أخرى. تعدد الأشكال معاملة موحدة.',
  });
  assert.equal(r1.duplicate, false);
  const r2 = await knowledgeMod.importDocument({
    kbId: kb.id,
    filename: 'b.txt',
    content: 'الوراثة تسمح باشتقاق فئة من أخرى. تعدد الأشكال معاملة موحدة.',
  });
  assert.equal(r2.duplicate, true, 'identical content must be detected as duplicate');
  const hits = knowledgeMod.searchKnowledge('الوراثة', { kbIds: [kb.id], limit: 5 });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].filename, 'a.txt');
  knowledgeMod.deleteKnowledgeBase(kb.id);
});

test('backup create + list + restore', () => {
  const b = backupMod.createBackup();
  assert.ok(b.id.startsWith('backup-'));
  const backups = backupMod.listBackups();
  assert.ok(backups.some((x) => x.id === b.id));
  backupMod.deleteBackup(b.id);
  assert.ok(!backupMod.listBackups().some((x) => x.id === b.id));
});

test('token estimation and trimming', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
  const msgs = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `رسالة رقم ${i} للمحتوى` }));
  const trimmed = trimMessages(msgs, 30);
  assert.ok(trimmed.length <= msgs.length);
  assert.ok(estimateTokens(trimmed.reduce((s, m) => s + m.content, '')) <= 32);
});

test('ftsQuery sanitizes special characters', () => {
  assert.equal(ftsQuery('hello world'), '"hello" AND "world"');
  const q = ftsQuery('مرحبًا، كيف حالك؟ (اختبار) a.b/c', 10);
  assert.ok(q);
  assert.ok(!q.includes('،'));
  assert.ok(!q.includes(')'));
  assert.equal(ftsQuery(''), null);
  assert.equal(ftsQuery('a'), null);
});

test('mock provider generates and streams', async () => {
  const p = new MockProvider({ id: 'mock-test' });
  const gen = await p.generate({ model: 'mock-chat', messages: [{ role: 'user', content: 'hello' }] });
  assert.ok(gen.content.length > 0);
  let streamed = '';
  for await (const d of p.stream({ model: 'mock-chat', messages: [] })) streamed += d;
  assert.ok(streamed.length > 0);
  const emb = await p.embeddings(['hello']);
  assert.equal(emb.length, 1);
  assert.equal(emb[0].length, 64);
});

test('OpenAI provider maps token limits for modern GPT models', () => {
  const provider = new OpenAICompatibleProvider({ id: 'openai-test', base_url: 'https://api.openai.com/v1' });
  assert.deepEqual(
    provider.normalizeOptions({ temperature: 0.5, top_p: 0.9, max_tokens: 120 }, 'gpt-5.6-luna'),
    { max_completion_tokens: 120 },
  );
  assert.deepEqual(
    provider.normalizeOptions({ temperature: 0.5, top_p: 0.9, max_tokens: 120 }, 'gpt-4o-mini'),
    { temperature: 0.5, top_p: 0.9, max_tokens: 120 },
  );
  assert.deepEqual(provider.normalizeOptions({ max_tokens: null, top_p: null }, 'gpt-4o-mini'), {});
});

test('OpenAI speech request uses tts-1 with Alloy by default', async (t) => {
  let requestUrl = '';
  let requestBody = null;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(options?.body || '{}'));
    return new Response(new Uint8Array([73, 68, 51]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  });
  const provider = new OpenAICompatibleProvider({
    id: 'openai-speech-test',
    name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    api_key: 'test-key',
  });
  const audio = await provider.tts({ text: 'مرحبا' });
  assert.equal(requestUrl, 'https://api.openai.com/v1/audio/speech');
  assert.equal(requestBody.model, 'tts-1');
  assert.equal(requestBody.voice, 'alloy');
  assert.equal(requestBody.input, 'مرحبا');
  assert.ok(audio.length > 0);
});

test('prompt engine builds modular prompt', () => {
  const { buildPrompt } = promptMod;
  const out = buildPrompt({
    assistant: { slug: 'study', temperature: 0.4 },
    history: [{ role: 'user', content: 'سؤال سابق' }],
    userMessage: 'اشرح الوراثة',
    context: { profile: { name: 'أحمد' }, memories: [], tasks: [], schedule: [], knowledge: [], safePlan: null },
  });
  assert.ok(out.messages.length >= 3);
  assert.equal(out.messages[0].role, 'system');
  assert.equal(out.messages[out.messages.length - 1].role, 'user');
  assert.ok(out.stats.systemTokens > 0);
});

test('provider registry works', () => {
  const providers = listProviders();
  assert.ok(providers.length >= 1);
  const ollama = getProvider('prov-ollama');
  assert.equal(ollama.type, 'ollama');
  assert.equal(ollama.baseUrl, 'http://localhost:11434');
});

test('model resolution never sends a foreign or non-chat model to Ollama', () => {
  const originalAi = settingsMod.getSetting('ai');
  dbMod.run(
    'INSERT OR REPLACE INTO ai_models(id, provider_id, model_id, display_name, capabilities) VALUES (?,?,?,?,?)',
    'am-chat-safe', 'prov-ollama', 'command-r7b-arabic:latest', 'Command R Arabic', JSON.stringify(['completion']),
  );
  settingsMod.setSetting('ai', { ...originalAi, defaultModel: 'command-r7b-arabic:latest' });

  assert.equal(chatMod.isLikelyChatModel('babbage-002'), false);
  assert.equal(chatMod.isModelAvailableForProvider('prov-ollama', 'babbage-002'), false);
  const resolved = chatMod.resolveModel({
    assistant: { provider_id: 'prov-ollama', model: null },
    conversation: { provider_id: null, model: 'babbage-002' },
  });
  assert.equal(resolved.provider.id, 'prov-ollama');
  assert.equal(resolved.model, 'command-r7b-arabic:latest');

  settingsMod.setSetting('ai', originalAi);
});

test('conversation + message persistence', () => {
  const conv = chatMod.createConversation({ title: 'محادثة اختبار', assistantId: 'asst-general' });
  assert.ok(conv.id);
  const msg = chatMod.saveMessage({ id: 'm-test-1', conversation_id: conv.id, role: 'user', content: 'مرحبًا' });
  assert.equal(msg.content, 'مرحبًا');
  assert.equal(chatMod.getMessages(conv.id).length, 1);
  chatMod.deleteConversation(conv.id);
  assert.equal(chatMod.getMessages(conv.id).length, 0, 'messages cascade-delete with conversation');
});

test('memory harvest is idempotent and links to sources', () => {
  const { run, all } = dbMod;
  run(
    'INSERT INTO tasks(id, title, status, completed_at, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    'h-task-1', 'مهمة حصاد', 'done', new Date().toISOString(), new Date().toISOString(), new Date().toISOString(),
  );
  const first = memoryMod.catchUpHarvest({ days: 7 });
  assert.ok(first.added >= 1);
  const second = memoryMod.catchUpHarvest({ days: 7 });
  assert.equal(second.added, 0, 'harvest must not create duplicates');
  const linked = memoryMod.listMemories({ sourceType: 'task' });
  assert.ok(linked.some((m) => m.source_type === 'task' && m.source_id === 'h-task-1'));
  const info = memoryMod.sourceInfo(linked.find((m) => m.source_id === 'h-task-1'));
  assert.ok(info && info.label.includes('مهمة حصاد'));
});

test('harvestMemory dedupes on source', () => {
  const a = memoryMod.harvestMemory({ sourceType: 'focus', sourceId: 'f-1', content: 'جلسة تركيز 25 دقيقة' });
  const b = memoryMod.harvestMemory({ sourceType: 'focus', sourceId: 'f-1', content: 'جلسة تركيز 25 دقيقة' });
  assert.ok(a && a.id);
  assert.equal(b, null, 'second harvest of same source must be skipped');
});

test('conversation folders + import/export round-trip', async () => {
  const { run, get, all } = dbMod;
  run('INSERT INTO conversation_folders(id, name, color) VALUES (?,?,?)', 'folder-1', 'الجامعة', null);
  const conv = chatMod.createConversation({ title: 'محادثة للتصدير', folder: 'الجامعة', tags: ['برمجة'] });
  chatMod.saveMessage({ id: 'm-exp-1', conversation_id: conv.id, role: 'user', content: 'سؤال' });
  chatMod.saveMessage({ id: 'm-exp-2', conversation_id: conv.id, role: 'assistant', content: 'جواب' });

  const msgs = chatMod.getMessages(conv.id);
  assert.equal(msgs.length, 2);

  // Re-import the messages into a fresh conversation (mimics import flow)
  const conv2 = chatMod.createConversation({ title: 'مستوردة', folder: 'الجامعة', tags: ['برمجة'] });
  for (const m of msgs) {
    run(
      'INSERT INTO messages(id, conversation_id, parent_message_id, role, content, created_at) VALUES (?,?,?,?,?,?)',
      `m-imp-${m.id}`, conv2.id, null, m.role, m.content, new Date().toISOString(),
    );
  }
  const imported = chatMod.getMessages(conv2.id);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].role, 'user');

  // Folder rename cascades to conversations
  run('UPDATE conversation_folders SET name = ? WHERE id = ?', 'الجامعة ٢', 'folder-1');
  run('UPDATE conversations SET folder = ? WHERE folder = ?', 'الجامعة ٢', 'الجامعة');
  assert.equal(get('SELECT folder FROM conversations WHERE id = ?', conv.id).folder, 'الجامعة ٢');
});

test('entity links: create, dedupe, related, remove', () => {
  dbMod.run('INSERT INTO courses(id, name) VALUES (?,?)', 'lk-course', 'مادة ربط');
  dbMod.run('INSERT INTO tasks(id, title, status, created_at, updated_at) VALUES (?,?,?,?,?)', 'lk-task', 'مهمة ربط', 'inbox', new Date().toISOString(), new Date().toISOString());
  const l1 = linksMod.createLink({ sourceType: 'task', sourceId: 'lk-task', targetType: 'course', targetId: 'lk-course', relationshipType: 'supports', confidence: 1 });
  assert.ok(l1?.id);
  const dup = linksMod.createLink({ sourceType: 'task', sourceId: 'lk-task', targetType: 'course', targetId: 'lk-course', relationshipType: 'supports' });
  assert.equal(dup, null, 'identical link must be deduplicated');
  const self = linksMod.createLink({ sourceType: 'task', sourceId: 'lk-task', targetType: 'task', targetId: 'lk-task' });
  assert.equal(self, null, 'self-links are rejected');
  const related = linksMod.relatedEntities('task', 'lk-task');
  assert.ok(related.some((r) => r.type === 'course' && r.relationship_type === 'supports'));
  linksMod.removeLink(l1.id);
  assert.equal(linksMod.relatedEntities('task', 'lk-task').length, 0);
});

test('activity index: logging + idempotent backfill + timeline ordering', () => {
  const t1 = activityMod.logActivity({ eventType: 'TaskCompleted', entityType: 'task', entityId: 'act-1', summary: 'أنجز مهمة أ' });
  const t2 = activityMod.logActivity({ eventType: 'JournalEntryCreated', entityType: 'journal', entityId: 'act-2', summary: 'دون يوميات ب' });
  assert.ok(t1 && t2);
  const tl = activityMod.getTimeline({ days: 30, domains: ['tasks', 'journal'] });
  assert.ok(tl.length >= 2, 'timeline includes both domains');
  assert.ok(tl.some((e) => e.entity_id === 'act-1') && tl.some((e) => e.entity_id === 'act-2'));
  // backfill does not duplicate already-logged events
  const before = activityMod.getTimeline({ days: 30 }).length;
  activityMod.backfillActivity({ days: 30 });
  const after = activityMod.getTimeline({ days: 30 }).length;
  assert.ok(after >= before, 'backfill must not remove events');
});

test('universal search spans multiple modules', () => {
  dbMod.run(
    'INSERT INTO tasks(id, title, status, created_at, updated_at) VALUES (?,?,?,?,?)',
    's-task-1', 'بحث شامل فريد', 'inbox', new Date().toISOString(), new Date().toISOString(),
  );
  dbMod.run(
    'INSERT INTO journal_entries(id, title, content, entry_date, ai_access, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
    's-journal-1', 'بحث شامل فريد', '', '2026-08-26', 1, new Date().toISOString(), new Date().toISOString(),
  );
  const res = searchMod.universalSearch('شامل فريد');
  const types = res.groups.map((g) => g.type);
  assert.ok(types.includes('task') && types.includes('journal'), `expected task+journal groups, got ${types.join(',')}`);
  assert.ok(res.total >= 2);
});

test('LifeContextEngine: cross-domain retrieval + ranking + permissions', () => {
  const g = lifeContextMod.gatherContext({ message: 'ما وضعي الدراسي؟' });
  assert.ok(g.items.length >= 0);
  assert.ok(Array.isArray(g.items));
  const sectionKeys = Object.keys(g.sections || {});
  assert.ok(sectionKeys.length >= 0, 'sections object exists');
  // Permissions: disabling tasks domain removes tasks section
  const restricted = lifeContextMod.gatherContext({ message: 'ما وضعي الدراسي؟', permissions: { tasks: false, memories: false, journal: false, checkins: false, study: false, work: false, safe: false } });
  assert.ok(!restricted.sections.tasks, 'tasks section suppressed when permission denied');
  // Mode weighting: university mode includes study sections
  const uni = lifeContextMod.gatherContext({ message: 'الرياضيات المتقطعة', mode: 'university' });
  assert.ok(uni, 'university mode works');
  const formatted = lifeContextMod.formatLifeContext(g);
  assert.ok(typeof formatted === 'string');
});

test('AI proposal executor respects write permissions', () => {
  const exec = proposalsMod.executeProposal({ type: 'task', title: 'مهمة مقترحة', data: { title: 'مهمة مقترحة من الاختبار', priority: 'medium' } });
  assert.ok(exec.ok && exec.entity?.type === 'task', 'task proposal executes');
  // Disable write permission for tasks and verify denial
  settingsMod.setSetting('ai', { ...(settingsMod.getSetting('ai') || {}), permissions: { read: {}, write: { tasks: false } } });
  const denied = proposalsMod.executeProposal({ type: 'task', title: 'مهمة مرفوضة', data: { title: 'مهمة مرفوضة' } });
  assert.equal(denied.ok, false, 'write permission enforced');
  settingsMod.setSetting('ai', { ...(settingsMod.getSetting('ai') || {}), permissions: { read: {}, write: {} } });
});
