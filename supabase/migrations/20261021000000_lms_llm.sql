-- Safe to run again (if not exists / drop if exists / or replace).
-- Language model for course tasks (ask() / chat() in the student's Python): the edge function `llm`
-- calls Anthropic or OpenRouter, whichever the teacher picked in the dashboard, and stops a user
-- once their monthly spending limit is reached. Also: the order of courses in the learning path.

-- ---------------------------------------------------------------- order of courses

alter table public.lms_courses add column if not exists position int not null default 100;

-- ---------------------------------------------------------------- settings (one row)

create table if not exists public.lms_llm_settings (
  id int primary key default 1 check (id = 1),
  provider text not null default 'anthropic' check (provider in ('anthropic', 'openrouter')),
  anthropic_model text not null default 'claude-haiku-5-5',
  openrouter_model text not null default 'anthropic/claude-haiku-5.5',
  -- how much newer models think before answering (thinking tokens are billed as output);
  -- null: do not send (models without effort, e.g. Claude Haiku 4.5, reject it)
  effort text default 'low' check (effort in ('low', 'medium', 'high')),
  -- USD per million tokens (Claude Haiku 5.5 for prompts up to 100k tokens);
  -- OpenRouter reports the real cost itself, these are the fallback
  input_price_per_mtok numeric not null default 0.10,
  output_price_per_mtok numeric not null default 0.50,
  student_monthly_limit_usd numeric not null default 1,
  teacher_monthly_limit_usd numeric not null default 10,
  updated_at timestamptz not null default now()
);
insert into public.lms_llm_settings (id) values (1) on conflict (id) do nothing;

alter table public.lms_llm_settings enable row level security;
drop policy if exists "teachers read llm settings" on public.lms_llm_settings;
create policy "teachers read llm settings" on public.lms_llm_settings
  for select to authenticated using (public.lms_is_teacher());
drop policy if exists "teachers change llm settings" on public.lms_llm_settings;
create policy "teachers change llm settings" on public.lms_llm_settings
  for update to authenticated using (public.lms_is_teacher()) with check (public.lms_is_teacher());

-- ---------------------------------------------------------------- per-student limits

-- a row overrides student_monthly_limit_usd for one e-mail
create table if not exists public.lms_llm_limits (
  email text primary key,
  monthly_limit_usd numeric not null check (monthly_limit_usd >= 0)
);

alter table public.lms_llm_limits enable row level security;
drop policy if exists "teachers manage llm limits" on public.lms_llm_limits;
create policy "teachers manage llm limits" on public.lms_llm_limits
  for all to authenticated using (public.lms_is_teacher()) with check (public.lms_is_teacher());

-- ---------------------------------------------------------------- usage

-- written only by the edge function (service role), one row per model call
create table if not exists public.lms_llm_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists lms_llm_usage_user_time on public.lms_llm_usage (user_id, created_at desc);

alter table public.lms_llm_usage enable row level security;
drop policy if exists "users read own usage, teachers all" on public.lms_llm_usage;
create policy "users read own usage, teachers all" on public.lms_llm_usage
  for select to authenticated using (user_id = auth.uid() or public.lms_is_teacher());

-- This month's spending per e-mail for the dashboard (auth.users is not reachable from the browser).
create or replace function public.lms_teacher_llm_usage()
returns table (email text, calls int, cost_usd numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.lms_is_teacher() then
    raise exception 'teachers only';
  end if;
  return query
    select lower(u.email)::text, count(*)::int, sum(x.cost_usd)
    from public.lms_llm_usage x join auth.users u on u.id = x.user_id
    where x.created_at >= date_trunc('month', now())
    group by u.email;
end;
$$;

revoke execute on function public.lms_teacher_llm_usage() from anon, public;
grant execute on function public.lms_teacher_llm_usage() to authenticated;

notify pgrst, 'reload schema';
