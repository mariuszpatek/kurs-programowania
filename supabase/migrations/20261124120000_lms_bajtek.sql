-- Safe to run again. Bajtek, the assistant at lesson notes (edge function `lesson-assistant`): its switch and daily
-- limit in lms_llm_settings (the teacher sets them in the dashboard, "Model AI"), its own usage table, separate from
-- Kodek's, and its row in lms_my_ai_usage() for the account page. The questions themselves are not stored.

-- ---------------------------------------------------------------- settings

alter table public.lms_llm_settings
  add column if not exists bajtek_enabled boolean not null default false,
  add column if not exists bajtek_daily_limit int not null default 40 check (bajtek_daily_limit >= 0);

-- ---------------------------------------------------------------- usage

create table if not exists public.lms_bajtek_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lms_bajtek_usage_user_day on public.lms_bajtek_usage (user_id, created_at);
-- no policies: only the functions below touch it
alter table public.lms_bajtek_usage enable row level security;

-- check and consume one question, like lms_use_assistant
create or replace function public.lms_use_bajtek(daily_limit int) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  used int;
begin
  if not public.lms_has_access() then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('lms_bajtek' || auth.uid()::text));
  select count(*) into used from public.lms_bajtek_usage
    where user_id = auth.uid() and created_at >= public.lms_today_start();
  if used >= daily_limit then
    return false;
  end if;
  insert into public.lms_bajtek_usage (user_id) values (auth.uid());
  return true;
end;
$$;

-- ---------------------------------------------------------------- what the student may see

-- Students cannot read lms_llm_settings; the lesson page only needs this switch.
create or replace function public.lms_bajtek_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select bajtek_enabled from public.lms_llm_settings where id = 1), false) $$;

-- as in …_lms_ai_settings.sql, plus Bajtek
create or replace function public.lms_my_ai_usage() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.lms_llm_settings;
  teacher boolean := public.lms_is_teacher();
  my_email text;
  override numeric;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into s from public.lms_llm_settings where id = 1;
  select lower(email) into my_email from auth.users where id = auth.uid();
  select monthly_limit_usd into override from public.lms_llm_limits where email = my_email;
  return jsonb_build_object(
    'explain', jsonb_build_object(
      'used', public.lms_explain_used_today(auth.uid()),
      'limit', case when teacher then s.explain_teacher_daily_limit else s.explain_daily_limit end),
    'assistant', jsonb_build_object(
      'enabled', coalesce(s.assistant_enabled, false),
      'used', (select count(*) from public.lms_assistant_usage
               where user_id = auth.uid() and created_at >= public.lms_today_start()),
      'limit', s.assistant_daily_limit),
    'bajtek', jsonb_build_object(
      'enabled', coalesce(s.bajtek_enabled, false),
      'used', (select count(*) from public.lms_bajtek_usage
               where user_id = auth.uid() and created_at >= public.lms_today_start()),
      'limit', s.bajtek_daily_limit),
    'llm', jsonb_build_object(
      'spent_usd', coalesce((select sum(cost_usd) from public.lms_llm_usage
                             where user_id = auth.uid() and created_at >= date_trunc('month', now())), 0),
      'limit_usd', coalesce(override, case when teacher then s.teacher_monthly_limit_usd else s.student_monthly_limit_usd end)));
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.lms_use_bajtek(int), public.lms_bajtek_enabled() from public, anon;
grant execute on function public.lms_use_bajtek(int), public.lms_bajtek_enabled(), public.lms_my_ai_usage() to authenticated;

notify pgrst, 'reload schema';
