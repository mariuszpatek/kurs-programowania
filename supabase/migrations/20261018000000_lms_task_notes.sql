-- Notes for the teacher about one task: solution, explanation, what to discuss.
-- Like lms_teacher_notes, a separate table so a student's task query can never include them.
create table public.lms_task_notes (
  course_id uuid not null references public.lms_courses on delete cascade,
  slug text not null,
  body_md text not null default '',
  primary key (course_id, slug)
);

alter table public.lms_task_notes enable row level security;

create policy "teachers read task notes" on public.lms_task_notes
  for select to authenticated using (public.lms_is_teacher());

notify pgrst, 'reload schema';
