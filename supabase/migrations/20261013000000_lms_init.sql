-- Programming course platform (LMS) living in the Supabase project shared with the Co Zabrać app.
-- Every object has the lms_ prefix. auth.users also contains Co Zabrać users, so access is granted
-- only to emails listed in lms_teachers or lms_enrollments.
-- Run once in the SQL Editor (not via `supabase db push`: the migration history belongs to Co Zabrać).

-- ---------------------------------------------------------------- people

create table public.lms_teachers (
  email text primary key check (email = lower(email))
);

create table public.lms_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  language text not null default 'python',
  level text not null default '',
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.lms_enrollments (
  email text not null check (email = lower(email)),
  course_id uuid not null references public.lms_courses on delete cascade,
  unlocked_through int not null default 1 check (unlocked_through >= 0),
  created_at timestamptz not null default now(),
  primary key (email, course_id)
);

-- ---------------------------------------------------------------- content

create table public.lms_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses on delete cascade,
  number int not null,
  title text not null,
  topics text[] not null default '{}',
  body_md text not null default '',
  unique (course_id, number)
);

create table public.lms_tasks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses on delete cascade,
  lesson_number int not null,
  number int not null,
  slug text not null,
  title text not null,
  kind text not null check (kind in ('code', 'predict')),
  body_md text not null default '',
  starter_code text not null default '',
  predict_code text not null default '',
  tests text not null default '',
  unique (course_id, slug)
);
create index lms_tasks_lesson on public.lms_tasks (course_id, lesson_number, number);

-- ---------------------------------------------------------------- student work

create table public.lms_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.lms_tasks on delete cascade,
  code text not null,
  passed boolean not null,
  results jsonb,
  created_at timestamptz not null default now()
);
create index lms_attempts_user_task on public.lms_attempts (user_id, task_id, created_at desc);

create table public.lms_assistant_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index lms_assistant_usage_user_day on public.lms_assistant_usage (user_id, created_at);

-- ---------------------------------------------------------------- access helpers

create function public.lms_email() returns text
language sql stable set search_path = ''
as $$ select lower(auth.jwt() ->> 'email') $$;

create function public.lms_is_teacher() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.lms_teachers where email = public.lms_email()) $$;

-- Highest unlocked lesson number for the current user in a course; null when not enrolled.
create function public.lms_unlocked_through(p_course_id uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select unlocked_through from public.lms_enrollments
  where email = public.lms_email() and course_id = p_course_id
$$;

create function public.lms_can_see_lesson(p_course_id uuid, p_lesson_number int) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.lms_is_teacher() or p_lesson_number <= public.lms_unlocked_through(p_course_id) $$;

create function public.lms_has_access() returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.lms_is_teacher()
      or exists (select 1 from public.lms_enrollments where email = public.lms_email())
$$;

-- ---------------------------------------------------------------- row level security

alter table public.lms_teachers enable row level security;
alter table public.lms_courses enable row level security;
alter table public.lms_enrollments enable row level security;
alter table public.lms_lessons enable row level security;
alter table public.lms_tasks enable row level security;
alter table public.lms_attempts enable row level security;
alter table public.lms_assistant_usage enable row level security;

-- Content is written only by the sync script (service role bypasses RLS), so there are no write policies.
create policy "enrolled students and teachers read courses" on public.lms_courses
  for select to authenticated
  using (public.lms_is_teacher() or public.lms_unlocked_through(id) is not null);

create policy "students read unlocked lessons" on public.lms_lessons
  for select to authenticated using (public.lms_can_see_lesson(course_id, number));

create policy "students read tasks of unlocked lessons" on public.lms_tasks
  for select to authenticated using (public.lms_can_see_lesson(course_id, lesson_number));

create policy "students read own enrollments" on public.lms_enrollments
  for select to authenticated using (email = public.lms_email() or public.lms_is_teacher());
create policy "teachers add enrollments" on public.lms_enrollments
  for insert to authenticated with check (public.lms_is_teacher());
create policy "teachers change enrollments" on public.lms_enrollments
  for update to authenticated using (public.lms_is_teacher()) with check (public.lms_is_teacher());
create policy "teachers remove enrollments" on public.lms_enrollments
  for delete to authenticated using (public.lms_is_teacher());

create policy "students save attempts on visible tasks" on public.lms_attempts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.lms_tasks t
      where t.id = task_id and public.lms_can_see_lesson(t.course_id, t.lesson_number)
    )
  );
create policy "students read own attempts, teachers all" on public.lms_attempts
  for select to authenticated using (user_id = auth.uid() or public.lms_is_teacher());

-- ---------------------------------------------------------------- teacher dashboard

-- auth.users is not reachable from the browser, so the dashboard gets emails through this function.
create function public.lms_teacher_attempts()
returns table (email text, task_id uuid, code text, passed boolean, results jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.lms_is_teacher() then
    raise exception 'teachers only';
  end if;
  return query
    select lower(u.email)::text, a.task_id, a.code, a.passed, a.results, a.created_at
    from public.lms_attempts a join auth.users u on u.id = a.user_id
    order by a.created_at desc
    limit 10000;
end;
$$;

-- ---------------------------------------------------------------- AI assistant quota

-- Atomic "check and consume": false when the user has no access or the daily limit is used up.
create function public.lms_use_assistant(daily_limit int) returns boolean
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
    where user_id = auth.uid() and created_at > now() - interval '1 day';
  if used >= daily_limit then
    return false;
  end if;
  insert into public.lms_assistant_usage (user_id) values (auth.uid());
  return true;
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public.lms_email(), public.lms_is_teacher(), public.lms_unlocked_through(uuid),
  public.lms_can_see_lesson(uuid, int), public.lms_has_access(),
  public.lms_teacher_attempts(), public.lms_use_assistant(int)
from anon, public;

grant execute on function
  public.lms_email(), public.lms_is_teacher(), public.lms_unlocked_through(uuid),
  public.lms_can_see_lesson(uuid, int), public.lms_has_access(),
  public.lms_teacher_attempts(), public.lms_use_assistant(int)
to authenticated;
