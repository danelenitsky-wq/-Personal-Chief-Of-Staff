-- Personal Chief of Staff: initial schema (Phase 1)
--
-- Single source of truth for both the WhatsApp agent and the web dashboard.
-- Every user-owned table carries user_id and is protected by row-level security,
-- so a logged-in dashboard user can only ever read or write their own rows.
-- Server-side jobs (WhatsApp webhook, cron) use the service-role key, which
-- bypasses RLS; those code paths must always filter by user_id explicitly.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users: one row per auth user (the "User Profile")
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone_number text unique,
  timezone text not null default 'UTC',
  week_starts_on smallint not null default 0 check (week_starts_on in (0, 1)),
  morning_brief_time time default '07:30',
  evening_review_enabled boolean not null default false,
  weekly_review_day smallint not null default 5 check (weekly_review_day between 0 and 6),
  working_hours_start time default '09:00',
  working_hours_end time default '18:00',
  preferred_deep_work_start time,
  preferred_deep_work_end time,
  preferred_workout_start time,
  preferred_workout_end time,
  life_areas text[] not null default array[
    'Work', 'Health', 'Family', 'Relationship', 'Fitness', 'Finance',
    'Home', 'Personal', 'Learning', 'Friends', 'Admin'
  ],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  goal text,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused', 'cancelled')),
  life_area text,
  deadline date,
  next_action_task_id uuid, -- FK added after tasks exists
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);
create index projects_status_idx on public.projects (user_id, status);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  status text not null default 'open'
    check (status in ('open', 'scheduled', 'waiting', 'completed', 'cancelled', 'someday')),
  priority text not null default 'normal'
    check (priority in ('high', 'normal', 'low')),
  priority_score numeric,
  life_area text,
  project_id uuid references public.projects (id) on delete set null,
  due_date date,
  due_time time,
  planned_date date,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  energy_level text check (energy_level in ('low', 'medium', 'high')),
  context text check (context in ('phone', 'computer', 'home', 'outside', 'anywhere')),
  postpone_count integer not null default 0,
  source text not null default 'dashboard'
    check (source in ('whatsapp', 'dashboard', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_status_idx on public.tasks (user_id, status);
create index tasks_due_date_idx on public.tasks (user_id, due_date);
create index tasks_planned_date_idx on public.tasks (user_id, planned_date);
create index tasks_project_id_idx on public.tasks (project_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.projects
  add constraint projects_next_action_task_id_fkey
  foreign key (next_action_task_id) references public.tasks (id) on delete set null;

-- Activity history shown in the task side panel.
create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  kind text not null
    check (kind in ('created', 'updated', 'completed', 'reopened', 'postponed', 'deleted')),
  detail text,
  source text not null default 'dashboard'
    check (source in ('whatsapp', 'dashboard', 'agent')),
  created_at timestamptz not null default now()
);

create index task_activity_task_id_idx on public.task_activity (task_id, created_at desc);
create index task_activity_user_id_idx on public.task_activity (user_id);

-- ---------------------------------------------------------------------------
-- waiting_for
-- ---------------------------------------------------------------------------

create table public.waiting_for (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  person text not null check (length(trim(person)) > 0),
  topic text not null check (length(trim(topic)) > 0),
  description text,
  expected_by date,
  project_id uuid references public.projects (id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index waiting_for_user_id_idx on public.waiting_for (user_id);
create index waiting_for_status_idx on public.waiting_for (user_id, status);
create index waiting_for_expected_by_idx on public.waiting_for (user_id, expected_by);
create index waiting_for_project_id_idx on public.waiting_for (project_id);

create trigger waiting_for_set_updated_at
  before update on public.waiting_for
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  waiting_for_id uuid references public.waiting_for (id) on delete cascade,
  remind_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_due_idx on public.reminders (status, remind_at);
create index reminders_task_id_idx on public.reminders (task_id);
create index reminders_waiting_for_id_idx on public.reminders (waiting_for_id);

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_connections (Google OAuth tokens, Phase 5)
-- Tokens are only ever read server-side with the service role.
-- ---------------------------------------------------------------------------

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  calendar_id text not null default 'primary',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index calendar_connections_user_id_idx on public.calendar_connections (user_id);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- conversation_messages (WhatsApp log, Phase 2)
-- ---------------------------------------------------------------------------

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  message_type text not null default 'text' check (message_type in ('text', 'audio', 'interactive', 'other')),
  body text,
  transcription text,
  external_id text unique,
  intent text,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index conversation_messages_user_id_idx on public.conversation_messages (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- memories (long-term operational memory)
-- ---------------------------------------------------------------------------

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memories_user_id_idx on public.memories (user_id);

create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- daily_plans
-- ---------------------------------------------------------------------------

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plan_date date not null,
  top_task_ids uuid[] not null default '{}',
  summary text,
  status text not null default 'proposed' check (status in ('proposed', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create index daily_plans_user_id_idx on public.daily_plans (user_id, plan_date);

create trigger daily_plans_set_updated_at
  before update on public.daily_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: users may only touch their own rows.
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_activity enable row level security;
alter table public.waiting_for enable row level security;
alter table public.reminders enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.memories enable row level security;
alter table public.daily_plans enable row level security;

create policy "users: own row" on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "projects: own rows" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tasks: own rows" on public.tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "task_activity: own rows" on public.task_activity
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "waiting_for: own rows" on public.waiting_for
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reminders: own rows" on public.reminders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- calendar_connections deliberately has no policy: OAuth tokens are only
-- reachable with the service role, never with a user's session.

create policy "conversation_messages: read own" on public.conversation_messages
  for select using (user_id = auth.uid());

create policy "memories: own rows" on public.memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "daily_plans: own rows" on public.daily_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
