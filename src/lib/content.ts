// Reads course content. Row level security decides what comes back:
// a student gets only their courses and lessons up to `unlocked_through`, a teacher gets everything.
import { supabase, currentUser } from './supabase';
import { languageById } from './languages';
import { url } from './url';

export type Course = {
  id: string;
  slug: string;
  title: string;
  language: string;
  level: string;
  description: string;
  tutor_prompt: string;
};
export type Enrollment = { email: string; course_id: string; unlocked_through: number };
export type Lesson = { id: string; course_id: string; number: number; title: string; topics: string[]; body_md: string; draft: boolean };
export type Task = {
  id: string;
  course_id: string;
  lesson_number: number;
  number: number;
  slug: string;
  title: string;
  kind: 'code' | 'predict';
  body_md: string;
  starter_code: string;
  predict_code: string;
  tests: string;
  /** Done together during the lesson rather than as homework. */
  in_class: boolean;
  /** Visible to the teacher only (RLS). */
  draft: boolean;
};
export type Access = { email: string; isTeacher: boolean; courses: Course[]; enrollments: Enrollment[] };

let access: Promise<Access | null> | null = null;

/**
 * Every page except login calls this first. Without a session it sends the visitor to the login page;
 * a signed-in account that is neither a teacher nor enrolled gets null and the page shows "no access".
 */
export function requireAccess(): Promise<Access | null> {
  access ??= (async () => {
    const user = await currentUser();
    if (!user) {
      location.replace(`${url('login/')}?next=${encodeURIComponent(location.pathname + location.search)}`);
      return new Promise<never>(() => {});
    }
    const [{ data: isTeacher }, { data: courses }, { data: enrollments }] = await Promise.all([
      supabase.rpc('lms_is_teacher'),
      supabase.from('lms_courses').select('*').order('title'),
      supabase.from('lms_enrollments').select('email, course_id, unlocked_through').eq('email', user.email!.toLowerCase()),
    ]);
    if (!isTeacher && !enrollments?.length) return null;
    return { email: user.email!, isTeacher: Boolean(isTeacher), courses: courses ?? [], enrollments: enrollments ?? [] };
  })();
  return access;
}

export async function courseBySlug(slug: string): Promise<Course | null> {
  const { data } = await supabase.from('lms_courses').select('*').eq('slug', slug).maybeSingle();
  return data;
}

/** Teacher-only notes per lesson number; empty for students (RLS returns no rows). */
export async function teacherNotes(courseId: string): Promise<Map<number, string>> {
  const { data } = await supabase.from('lms_teacher_notes').select('lesson_number, body_md').eq('course_id', courseId);
  return new Map((data ?? []).map((n) => [n.lesson_number, n.body_md]));
}

export async function lessons(courseId: string): Promise<Lesson[]> {
  const { data } = await supabase.from('lms_lessons').select('*').eq('course_id', courseId).order('number');
  return data ?? [];
}

export async function tasks(courseId: string): Promise<Task[]> {
  const { data } = await supabase.from('lms_tasks').select('*').eq('course_id', courseId).order('lesson_number').order('number');
  return data ?? [];
}

export async function taskBySlug(courseId: string, slug: string): Promise<Task | null> {
  const { data } = await supabase.from('lms_tasks').select('*').eq('course_id', courseId).eq('slug', slug).maybeSingle();
  return data;
}

/** Course label like "Podstawy · Python". */
export function courseLabel(course: Course): string {
  return [course.level, languageById(course.language).label].filter(Boolean).join(' · ');
}

/** The course's tutor prompt with {{topics}} filled in from lessons up to `lessonNumber`. */
export function tutorPrompt(course: Course, all: Lesson[], lessonNumber: number): string {
  return course.tutor_prompt.replace('{{topics}}', topicsUpTo(all, lessonNumber));
}

/** Topics of all visible lessons up to `lessonNumber`, for the AI assistant. */
export function topicsUpTo(all: Lesson[], lessonNumber: number): string {
  return all
    .filter((l) => l.number <= lessonNumber)
    .map((l) => `Lekcja ${l.number}: ${l.topics.join(', ')}`)
    .join('\n');
}

export const coursePath = (c: Course) => `${url('course/')}?c=${encodeURIComponent(c.slug)}`;
/** Course page scrolled to one lesson's card (its task list). */
export const lessonTasksPath = (c: Course, n: number) => `${coursePath(c)}#lekcja-${n}`;
export const lessonPath = (c: Course, n: number) => `${url('lesson/')}?c=${encodeURIComponent(c.slug)}&n=${n}`;
export const taskPath = (c: Course, t: Task) => `${url('task/')}?c=${encodeURIComponent(c.slug)}&t=${encodeURIComponent(t.slug)}`;
