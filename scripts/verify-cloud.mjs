import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const sql = read('supabase/migrations/202608260001_aishaman_cloud.sql');
const env = read('frontend/.env.example');
const vercel = JSON.parse(read('vercel.json'));
const client = read('frontend/src/cloud/client.ts');
const ai = read('serverless/cloud-ai.ts');
const bridge = read('frontend/src/cloud/bridge.ts');
const aiTts = read('serverless/routes/ai-tts.ts');

const privateTables = [
  'profiles','user_settings','ai_provider_profiles','ai_models','assistants','conversation_folders',
  'conversations','messages','memories','memory_tags','goals','courses','projects','tasks',
  'goal_milestones','journal_entries','journal_attachments','gratitude_entries','calendar_events',
  'checkins','course_topics','exams','work_shifts','work_notes','knowledge_bases','documents',
  'document_chunks','audio_files','audio_presets','sound_scenes','focus_sessions','safe_living_plans',
  'safe_living_sessions','automation_rules','notifications','entity_links','link_suggestions',
  'activity_events','migration_runs',
];

const failures = [];
for (const table of privateTables) {
  if (!sql.includes(`create table if not exists public.${table}`)) failures.push(`missing table: ${table}`);
  if (!sql.includes(`'${table}'`)) failures.push(`table absent from RLS loop: ${table}`);
}
for (const command of ['select', 'insert', 'update', 'delete']) {
  if (!sql.includes(`command_name = '${command}'`) && command !== 'delete') failures.push(`missing explicit RLS branch: ${command}`);
}
if (!sql.includes("array['select','insert','update','delete']")) failures.push('missing four-command RLS policy loop');
if (!sql.includes('revoke all on table public.%I from anon') || !sql.includes('grant select, insert, update, delete on table public.%I to authenticated')) failures.push('role grants/revocations missing');
if (!sql.includes("storage.buckets")) failures.push('private Storage bucket missing');
if (!sql.includes('supabase_realtime')) failures.push('Realtime publication missing');
if (!env.includes('VITE_SUPABASE_URL') || !env.includes('VITE_SUPABASE_PUBLISHABLE_KEY')) failures.push('required env variables missing');
if (/service[_-]?role/i.test(client) || /OPENAI_API_KEY/.test(client)) failures.push('server secret reference found in browser client');
if (vercel.outputDirectory !== 'frontend/dist') failures.push('unexpected Vercel output directory');
if (!ai.includes('/auth/v1/user')) failures.push('cloud AI does not verify Supabase JWTs');
if (!ai.includes("'deepseek-chat'")) failures.push('stable DeepSeek default model is missing');
if (!ai.includes("'/responses'")) failures.push('OpenAI Responses API adapter is missing');
if (!ai.includes('/audio/speech') || !ai.includes("'alloy'")) failures.push('OpenAI Alloy speech adapter is missing');
if (!aiTts.includes('authContext') || !aiTts.includes('assertCloudAiAllowed')) failures.push('cloud TTS route is not authenticated/privacy-aware');
if (!JSON.stringify(vercel.rewrites).includes('route=ai-tts')) failures.push('cloud TTS rewrite is missing');
if (/deepseek-v4-(?:flash|pro)/.test(ai + bridge)) failures.push('obsolete DeepSeek model identifier remains');
if (!read('.env.example').includes('AI_PROVIDER=')) failures.push('cloud AI provider env documentation missing');
if (!read('.env.example').includes('OPENAI_TTS_VOICE=alloy')) failures.push('Alloy voice env documentation missing');

if (failures.length) {
  console.error(`Cloud verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Cloud verification passed: ${privateTables.length} private tables, RLS policy generator, private Storage, Realtime, env, and Vercel config.`);
