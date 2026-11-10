-- Safe to run again. The daily limit of "Wytłumacz koledze" counts from midnight Polish time (it counted the
-- last 24 hours, so it never reset at one hour the student could be told), and the edge function can read
-- how much of it is used for the account page.

create or replace function public.lms_explain_today_start() returns timestamptz
language sql stable set search_path = ''
as $$ select date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw' $$;

create or replace function public.lms_use_explain(p_user uuid, p_task uuid, daily_limit int, task_limit int) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lms_explain' || p_user::text));
  if (select count(*) from public.lms_explain_usage
      where user_id = p_user and created_at >= public.lms_explain_today_start()) >= daily_limit then
    return 'daily';
  end if;
  if (select count(*) from public.lms_explain_usage where user_id = p_user and task_id = p_task) >= task_limit then
    return 'task';
  end if;
  insert into public.lms_explain_usage (user_id, task_id) values (p_user, p_task);
  return 'ok';
end;
$$;

-- messages used today; called by the edge function, which knows the limits
create or replace function public.lms_explain_used_today(p_user uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.lms_explain_usage
  where user_id = p_user and created_at >= public.lms_explain_today_start()
$$;

revoke execute on function public.lms_use_explain(uuid, uuid, int, int) from public, anon, authenticated;
revoke execute on function public.lms_explain_used_today(uuid) from public, anon, authenticated;
grant execute on function public.lms_use_explain(uuid, uuid, int, int) to service_role;
grant execute on function public.lms_explain_used_today(uuid) to service_role;

notify pgrst, 'reload schema';
