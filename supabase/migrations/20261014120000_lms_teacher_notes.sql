-- Notes for the teacher about a lesson: plan, extra examples, answers, what to discuss.
-- A separate table (not a column of lms_lessons) so a student's lesson query can never include them.
create table public.lms_teacher_notes (
  course_id uuid not null references public.lms_courses on delete cascade,
  lesson_number int not null,
  body_md text not null default '',
  primary key (course_id, lesson_number)
);

alter table public.lms_teacher_notes enable row level security;

create policy "teachers read notes" on public.lms_teacher_notes
  for select to authenticated using (public.lms_is_teacher());
