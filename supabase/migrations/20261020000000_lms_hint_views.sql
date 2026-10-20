-- Which hints a student opened (src/lib/hints.ts); the dashboard shows "podpowiedzi 2/3" per task.
create table public.lms_hint_views (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.lms_tasks on delete cascade,
  hint_index int not null,
  opened_at timestamptz not null default now(),
  primary key (user_id, task_id, hint_index)
);

alter table public.lms_hint_views enable row level security;

create policy "students save own hint views on visible tasks" on public.lms_hint_views
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.lms_tasks t
      where t.id = task_id and public.lms_can_see_lesson(t.course_id, t.lesson_number)
    )
  );

create policy "students read own hint views, teachers all" on public.lms_hint_views
  for select to authenticated using (user_id = auth.uid() or public.lms_is_teacher());

-- Like lms_teacher_attempts: the dashboard needs e-mails, which only auth.users has.
create function public.lms_teacher_hint_views()
returns table (email text, task_id uuid, opened int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.lms_is_teacher() then
    raise exception 'teachers only';
  end if;
  return query
    select lower(u.email)::text, h.task_id, count(*)::int
    from public.lms_hint_views h join auth.users u on u.id = h.user_id
    group by u.email, h.task_id;
end;
$$;

revoke execute on function public.lms_teacher_hint_views() from anon, public;
grant execute on function public.lms_teacher_hint_views() to authenticated;

notify pgrst, 'reload schema';
