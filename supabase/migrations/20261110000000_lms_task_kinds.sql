-- Every task kind together: 'local' (20261021000000_lms_llm.sql), 'choice' (20261108000000_lms_task_choice.sql)
-- and 'explain' (20261109000000_lms_task_explain.sql) each set the whole list, so whichever ran last dropped
-- the others. Run after all three. Safe to run again.
alter table public.lms_tasks drop constraint if exists lms_tasks_kind_check;
alter table public.lms_tasks add constraint lms_tasks_kind_check check (kind in ('code', 'predict', 'local', 'choice', 'explain'));

notify pgrst, 'reload schema';
