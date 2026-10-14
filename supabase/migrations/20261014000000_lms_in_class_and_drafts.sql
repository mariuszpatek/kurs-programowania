-- Tasks done together during the lesson are listed apart from homework.
alter table public.lms_tasks add column in_class boolean not null default false;

-- Drafts are uploaded so the teacher can review them on the site; students never see them.
alter table public.lms_lessons add column draft boolean not null default false;
alter table public.lms_tasks add column draft boolean not null default false;

drop policy "students read unlocked lessons" on public.lms_lessons;
create policy "students read unlocked lessons" on public.lms_lessons
  for select to authenticated
  using (public.lms_is_teacher() or (not draft and public.lms_can_see_lesson(course_id, number)));

drop policy "students read tasks of unlocked lessons" on public.lms_tasks;
create policy "students read tasks of unlocked lessons" on public.lms_tasks
  for select to authenticated
  using (public.lms_is_teacher() or (not draft and public.lms_can_see_lesson(course_id, lesson_number)));
