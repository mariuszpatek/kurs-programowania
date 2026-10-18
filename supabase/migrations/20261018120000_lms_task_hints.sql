-- Graded hints a student can reveal one by one after failed checks (src/lib/hints.ts).
-- Students may read them: they are written to help without giving the solution away.
alter table public.lms_tasks add column hints text[] not null default '{}';

notify pgrst, 'reload schema';
