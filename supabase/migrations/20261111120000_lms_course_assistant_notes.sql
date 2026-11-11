-- Safe to run again. The course's note for the tutor at tasks (assistant.md in the course folder of the content
-- repository, synced by sync-content): who the students of this course are and what the tutor should know about
-- it. Students may read it like the rest of lms_courses; it holds no answers.
alter table public.lms_courses add column if not exists assistant_notes text not null default '';

notify pgrst, 'reload schema';
