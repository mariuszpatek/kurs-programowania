-- Safe to run again (if not exists / drop if exists / or replace).
-- When a student was on the platform and what they opened (src/lib/visits.ts); the dashboard groups
-- the visits into sessions: "wt 20 paź, 17:05–17:40: lekcja 2, zadanie 2.3".
create table if not exists public.lms_visits (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null references public.lms_courses on delete cascade,
  lesson_number int,
  task_id uuid references public.lms_tasks on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lms_visits_user_time on public.lms_visits (user_id, created_at desc);

alter table public.lms_visits enable row level security;

-- a student records only their own visits, only in a course they are enrolled in
drop policy if exists "students save own visits" on public.lms_visits;
create policy "students save own visits" on public.lms_visits
  for insert to authenticated
  with check (user_id = auth.uid() and public.lms_unlocked_through(course_id) is not null);

drop policy if exists "teachers read visits" on public.lms_visits;
create policy "teachers read visits" on public.lms_visits
  for select to authenticated using (public.lms_is_teacher());

-- Like lms_teacher_attempts: the dashboard needs e-mails, which only auth.users has.
create or replace function public.lms_teacher_visits()
returns table (email text, course_id uuid, lesson_number int, task_id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.lms_is_teacher() then
    raise exception 'teachers only';
  end if;
  return query
    select lower(u.email)::text, v.course_id, v.lesson_number, v.task_id, v.created_at
    from public.lms_visits v join auth.users u on u.id = v.user_id
    order by v.created_at desc;
end;
$$;

revoke execute on function public.lms_teacher_visits() from anon, public;
grant execute on function public.lms_teacher_visits() to authenticated;

notify pgrst, 'reload schema';
