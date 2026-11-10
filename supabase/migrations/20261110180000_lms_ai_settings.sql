-- Safe to run again. Models and limits of the tutor (`assistant`) and of "Wytłumacz koledze" (`explain`)
-- move from function secrets to lms_llm_settings, so the teacher changes them in the dashboard ("Model AI").
-- The tutor is switched on there too (it was PUBLIC_ASSISTANT=1 at build time). Every daily limit counts
-- from midnight Polish time, and lms_my_ai_usage() gives the account page all limits in one call.

-- ---------------------------------------------------------------- settings

alter table public.lms_llm_settings
  add column if not exists assistant_enabled boolean not null default false,
  add column if not exists assistant_daily_limit int not null default 40 check (assistant_daily_limit >= 0),
  add column if not exists explain_chat_model text not null default 'claude-haiku-5-5',
  add column if not exists explain_summary_model text not null default 'claude-sonnet-5-5',
  add column if not exists explain_daily_limit int not null default 60 check (explain_daily_limit >= 0),
  add column if not exists explain_teacher_daily_limit int not null default 300 check (explain_teacher_daily_limit >= 0),
  add column if not exists explain_task_limit int not null default 80 check (explain_task_limit >= 0);

-- ---------------------------------------------------------------- one "today" for every daily limit

create or replace function public.lms_today_start() returns timestamptz
language sql stable set search_path = ''
as $$ select date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw' $$;

create or replace function public.lms_use_explain(p_user uuid, p_task uuid, daily_limit int, task_limit int) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lms_explain' || p_user::text));
  if (select count(*) from public.lms_explain_usage
      where user_id = p_user and created_at >= public.lms_today_start()) >= daily_limit then
    return 'daily';
  end if;
  if (select count(*) from public.lms_explain_usage where user_id = p_user and task_id = p_task) >= task_limit then
    return 'task';
  end if;
  insert into public.lms_explain_usage (user_id, task_id) values (p_user, p_task);
  return 'ok';
end;
$$;

create or replace function public.lms_explain_used_today(p_user uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.lms_explain_usage
  where user_id = p_user and created_at >= public.lms_today_start()
$$;

drop function if exists public.lms_explain_today_start();

-- the tutor: same check-and-consume as before, but the day starts at midnight
create or replace function public.lms_use_assistant(daily_limit int) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  used int;
begin
  if not public.lms_has_access() then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('lms_assistant' || auth.uid()::text));
  select count(*) into used from public.lms_assistant_usage
    where user_id = auth.uid() and created_at >= public.lms_today_start();
  if used >= daily_limit then
    return false;
  end if;
  insert into public.lms_assistant_usage (user_id) values (auth.uid());
  return true;
end;
$$;

-- ---------------------------------------------------------------- what the student may see

-- Students cannot read lms_llm_settings (prices, other limits); the task page only needs this switch.
create or replace function public.lms_assistant_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select assistant_enabled from public.lms_llm_settings where id = 1), false) $$;

-- The signed-in person's AI limits for the account page: today's messages to Robcio and the tutor,
-- this month's spending on ask() / chat().
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
    'llm', jsonb_build_object(
      'spent_usd', coalesce((select sum(cost_usd) from public.lms_llm_usage
                             where user_id = auth.uid() and created_at >= date_trunc('month', now())), 0),
      'limit_usd', coalesce(override, case when teacher then s.teacher_monthly_limit_usd else s.student_monthly_limit_usd end)));
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.lms_use_explain(uuid, uuid, int, int) from public, anon, authenticated;
revoke execute on function public.lms_explain_used_today(uuid) from public, anon, authenticated;
grant execute on function public.lms_use_explain(uuid, uuid, int, int) to service_role;
grant execute on function public.lms_explain_used_today(uuid) to service_role;

revoke execute on function public.lms_assistant_enabled() from public, anon;
revoke execute on function public.lms_my_ai_usage() from public, anon;
grant execute on function public.lms_assistant_enabled() to authenticated;
grant execute on function public.lms_my_ai_usage() to authenticated;

notify pgrst, 'reload schema';
