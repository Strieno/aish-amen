-- AishAman cloud schema
-- IDs stay as text so a one-time import can preserve every legacy SQLite ID.
-- Every private row is scoped to auth.uid() and protected by RLS.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  avatar text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, key)
);

-- Deliberately excludes API keys. Secrets remain in the trusted AI backend.
create table if not exists public.ai_provider_profiles (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  name text not null,
  base_url text,
  embedding_model text,
  timeout_ms integer default 120000,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.ai_models (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  model_id text not null,
  display_name text,
  context_limit integer,
  capabilities jsonb not null default '[]'::jsonb,
  last_seen timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, provider_id) references public.ai_provider_profiles(user_id, id) on delete cascade
);

create table if not exists public.assistants (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  system_prompt text,
  model text,
  provider_id text,
  temperature double precision default 0.6,
  context_limit integer,
  memory_permissions jsonb,
  tool_permissions jsonb,
  voice text,
  response_style text,
  knowledge_base_ids jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  unique (user_id, slug)
);

create table if not exists public.conversation_folders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.conversations (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  assistant_id text,
  provider_id text,
  model text,
  folder text,
  pinned boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  context jsonb,
  mode text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.messages (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  parent_message_id text,
  role text not null check (role in ('system','user','assistant','tool')),
  content text not null default '',
  model text,
  provider text,
  tokens_in integer,
  tokens_out integer,
  generation_ms integer,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, conversation_id) references public.conversations(user_id, id) on delete cascade
);

create table if not exists public.memories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  type text not null default 'general',
  importance double precision default 0.5,
  source text,
  source_type text,
  source_id text,
  confidence double precision default 0.5,
  tags jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  archived boolean not null default false,
  ai_access boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.memory_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id text not null,
  tag text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, memory_id, tag),
  foreign key (user_id, memory_id) references public.memories(user_id, id) on delete cascade
);

create table if not exists public.goals (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  life_area text,
  target_date date,
  status text not null default 'active',
  progress double precision not null default 0,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.courses (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  credit_hours double precision default 3,
  instructor text,
  semester text,
  target_grade text,
  notes text not null default '',
  color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.projects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal_id text,
  workspace text,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.goals(user_id, id) on delete set null (goal_id)
);

create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'medium',
  energy text not null default 'medium',
  est_minutes integer,
  due_date date,
  project_id text,
  course_id text,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'inbox',
  recurring_rule text,
  dependencies jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, project_id) references public.projects(user_id, id) on delete set null (project_id),
  foreign key (user_id, course_id) references public.courses(user_id, id) on delete set null (course_id)
);

create table if not exists public.goal_milestones (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null,
  title text not null,
  done boolean not null default false,
  due_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, goal_id) references public.goals(user_id, id) on delete cascade
);

create table if not exists public.journal_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  entry_date date not null,
  tags jsonb not null default '[]'::jsonb,
  mood text,
  ai_access boolean not null default true,
  ai_summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.journal_attachments (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_id text not null,
  kind text not null,
  path text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, journal_id) references public.journal_entries(user_id, id) on delete cascade
);

create table if not exists public.gratitude_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  entry_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.calendar_events (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start timestamptz not null,
  "end" timestamptz,
  category text not null default 'general',
  location text,
  notes text not null default '',
  reminders jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.checkins (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  energy integer,
  stress integer,
  sleep_hours double precision,
  concern text not null default '',
  success text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  unique (user_id, entry_date)
);

create table if not exists public.course_topics (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  title text not null,
  notes text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, course_id) references public.courses(user_id, id) on delete cascade
);

create table if not exists public.exams (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  title text not null,
  exam_type text not null default 'OTHER',
  exam_date date,
  weight double precision,
  grade double precision,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, course_id) references public.courses(user_id, id) on delete cascade
);

create table if not exists public.work_shifts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_start timestamptz not null,
  shift_end timestamptz,
  role text,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.work_notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.knowledge_bases (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.documents (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kb_id text not null,
  filename text not null,
  path text not null,
  hash text not null,
  status text not null default 'pending',
  page_count integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, kb_id) references public.knowledge_bases(user_id, id) on delete cascade
);

create table if not exists public.document_chunks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  content text not null,
  chunk_index integer not null,
  tokens integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, document_id) references public.documents(user_id, id) on delete cascade
);

create table if not exists public.audio_files (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  path text not null,
  category text not null default 'sound',
  duration double precision,
  tags jsonb not null default '[]'::jsonb,
  favorite boolean not null default false,
  volume double precision not null default 0.8,
  loop_enabled boolean not null default false,
  fade_in double precision not null default 0,
  fade_out double precision not null default 0,
  notes text not null default '',
  hash text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.audio_presets (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tracks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.sound_scenes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tracks jsonb not null default '[]'::jsonb,
  tts_voice text,
  volume double precision not null default 0.8,
  timer_minutes integer,
  theme text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.focus_sessions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes integer not null,
  task_id text,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, task_id) references public.tasks(user_id, id) on delete set null (task_id)
);

create table if not exists public.safe_living_plans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger text not null default '',
  signs text not null default '',
  immediate_actions jsonb not null default '[]'::jsonb,
  not_to_do jsonb not null default '[]'::jsonb,
  resources jsonb not null default '[]'::jsonb,
  reminders jsonb not null default '[]'::jsonb,
  audio_scene text,
  ai_instructions text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.safe_living_sessions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text,
  activated_at timestamptz not null default timezone('utc', now()),
  status text not null default 'active',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  foreign key (user_id, plan_id) references public.safe_living_plans(user_id, id) on delete set null (plan_id)
);

create table if not exists public.automation_rules (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger jsonb not null,
  actions jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.notifications (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  due_at timestamptz,
  category text not null default 'general',
  seen boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.entity_links (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relationship_type text not null default 'related_to',
  confidence double precision not null default 1,
  created_by text not null default 'user',
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id),
  unique (user_id, source_type, source_id, target_type, target_id, relationship_type)
);

create table if not exists public.link_suggestions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relationship_type text not null default 'related_to',
  confidence double precision not null default 0.5,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.activity_events (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id text,
  ts timestamptz not null,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.migration_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_fingerprint text not null,
  row_counts jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, source, source_fingerprint)
);

create index if not exists idx_tasks_user_status on public.tasks(user_id, status);
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);
create index if not exists idx_messages_user_conversation on public.messages(user_id, conversation_id, created_at);
create index if not exists idx_memories_user_source on public.memories(user_id, source_type, source_id);
create index if not exists idx_memories_user_updated on public.memories(user_id, updated_at desc);
create index if not exists idx_goals_user_updated on public.goals(user_id, updated_at desc);
create index if not exists idx_journal_user_date on public.journal_entries(user_id, entry_date desc);
create index if not exists idx_checkins_user_date on public.checkins(user_id, entry_date desc);
create index if not exists idx_documents_user_kb on public.documents(user_id, kb_id);
create index if not exists idx_chunks_user_document on public.document_chunks(user_id, document_id, chunk_index);
create index if not exists idx_links_user_source on public.entity_links(user_id, source_type, source_id);
create index if not exists idx_links_user_target on public.entity_links(user_id, target_type, target_id);
create index if not exists idx_activity_user_ts on public.activity_events(user_id, ts desc);
create index if not exists idx_activity_user_entity on public.activity_events(user_id, entity_type, entity_id);

do $$
declare
  table_name text;
  policy_name text;
  command_name text;
  sync_tables constant text[] := array[
    'profiles','user_settings','ai_provider_profiles','ai_models','assistants','conversation_folders',
    'conversations','messages','memories','memory_tags','goals','courses','projects','tasks',
    'goal_milestones','journal_entries','journal_attachments','gratitude_entries',
    'calendar_events','checkins','course_topics','exams','work_shifts','work_notes',
    'knowledge_bases','documents','document_chunks','audio_files','audio_presets','sound_scenes',
    'focus_sessions','safe_living_plans','safe_living_sessions','automation_rules','notifications',
    'entity_links','link_suggestions','activity_events','migration_runs'
  ];
begin
  foreach table_name in array sync_tables loop
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);

    foreach command_name in array array['select','insert','update','delete'] loop
      policy_name := table_name || '_own_' || command_name;
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = table_name and policyname = policy_name
      ) then
        if command_name = 'select' then
          execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', policy_name, table_name);
        elsif command_name = 'insert' then
          execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', policy_name, table_name);
        elsif command_name = 'update' then
          execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', policy_name, table_name);
        else
          execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', policy_name, table_name);
        end if;
      end if;
    end loop;

    if not exists (
      select 1 from pg_trigger
      where tgname = 'set_' || table_name || '_updated_at'
    ) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_' || table_name || '_updated_at', table_name);
    end if;
  end loop;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit)
values ('aishaman-private', 'aishaman-private', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists aishaman_private_select on storage.objects;
create policy aishaman_private_select on storage.objects for select to authenticated
using (bucket_id = 'aishaman-private' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists aishaman_private_insert on storage.objects;
create policy aishaman_private_insert on storage.objects for insert to authenticated
with check (bucket_id = 'aishaman-private' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists aishaman_private_update on storage.objects;
create policy aishaman_private_update on storage.objects for update to authenticated
using (bucket_id = 'aishaman-private' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'aishaman-private' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists aishaman_private_delete on storage.objects;
create policy aishaman_private_delete on storage.objects for delete to authenticated
using (bucket_id = 'aishaman-private' and split_part(name, '/', 1) = (select auth.uid())::text);

do $$
declare table_name text;
begin
  foreach table_name in array array['tasks','memories','goals','journal_entries','checkins'] loop
    execute format('alter table public.%I replica identity full', table_name);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

comment on schema public is 'AishAman user-owned cloud data. RLS is mandatory on every private table.';
comment on table public.ai_provider_profiles is 'Non-secret provider metadata only. API keys belong in the trusted backend, never the browser.';
