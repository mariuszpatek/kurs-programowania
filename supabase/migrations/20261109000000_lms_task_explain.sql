-- "Wytłumacz koledze" tasks (kind = 'explain'): the student explains concepts to a friend played by Claude
-- in the edge function `explain`, which also counts the messages here.
alter table public.lms_tasks drop constraint if exists lms_tasks_kind_check;
alter table public.lms_tasks add constraint lms_tasks_kind_check check (kind in ('code', 'predict', 'choice', 'explain'));

create table if not exists public.lms_explain_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  task_id uuid not null references public.lms_tasks on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lms_explain_usage_user on public.lms_explain_usage (user_id, created_at);
create index if not exists lms_explain_usage_user_task on public.lms_explain_usage (user_id, task_id);

-- Only the edge function writes and reads it (service role), so no policies.
alter table public.lms_explain_usage enable row level security;

-- Counts one message and says whether it fits: 'ok', 'daily' (all explain tasks in the last day)
-- or 'task' (all messages of this student in this task).
create or replace function public.lms_use_explain(p_user uuid, p_task uuid, daily_limit int, task_limit int) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lms_explain' || p_user::text));
  if (select count(*) from public.lms_explain_usage
      where user_id = p_user and created_at > now() - interval '1 day') >= daily_limit then
    return 'daily';
  end if;
  if (select count(*) from public.lms_explain_usage where user_id = p_user and task_id = p_task) >= task_limit then
    return 'task';
  end if;
  insert into public.lms_explain_usage (user_id, task_id) values (p_user, p_task);
  return 'ok';
end;
$$;

revoke execute on function public.lms_use_explain(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.lms_use_explain(uuid, uuid, int, int) to service_role;

notify pgrst, 'reload schema';
