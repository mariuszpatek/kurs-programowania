-- Publishing is decided in the teacher dashboard, not in the content files:
-- this flips a lesson and all its tasks between draft (teacher only) and published.
create function public.lms_set_lesson_published(p_course_id uuid, p_lesson_number int, p_published boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.lms_is_teacher() then
    raise exception 'teachers only';
  end if;
  update public.lms_lessons set draft = not p_published
    where course_id = p_course_id and number = p_lesson_number;
  update public.lms_tasks set draft = not p_published
    where course_id = p_course_id and lesson_number = p_lesson_number;
end;
$$;

revoke execute on function public.lms_set_lesson_published(uuid, int, boolean) from anon, public;
grant execute on function public.lms_set_lesson_published(uuid, int, boolean) to authenticated;
