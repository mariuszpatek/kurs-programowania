-- Both new task kinds together: 'local' (20261021000000_lms_llm.sql) and 'choice' (20261108000000_lms_task_choice.sql)
-- each set the whole list, so whichever ran last dropped the other. Run after both.
alter table public.lms_tasks drop constraint if exists lms_tasks_kind_check;
alter table public.lms_tasks add constraint lms_tasks_kind_check check (kind in ('code', 'predict', 'local', 'choice'));

notify pgrst, 'reload schema';
