-- "Choose the answer" tasks: questions with A) B) C) buttons in the task text (src/lib/quiz.ts).
-- The task is done once every question has its right answer.
alter table public.lms_tasks drop constraint lms_tasks_kind_check;
alter table public.lms_tasks add constraint lms_tasks_kind_check check (kind in ('code', 'predict', 'choice'));

notify pgrst, 'reload schema';
