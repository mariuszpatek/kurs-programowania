// "Kiedy uczeń był na platformie": every opening of the course, a lesson or a task is saved
// (lms_visits) and the teacher dashboard turns the visits into sessions. Logins alone would say
// little, because the browser keeps a student signed in for weeks.
import { supabase } from './supabase';
import type { Access } from './content';

/** The same page opened again within this time (refresh, back and forth) is one visit. */
const REPEAT_MS = 10 * 60 * 1000;

export type Visit = { courseId: string; lessonNumber?: number; taskId?: string };

export function recordVisit(access: Access, visit: Visit) {
  // the teacher's own browsing (also in the student preview) is not a student's history
  if (access.canPreview) return;
  const key = `kurs:visit:${visit.courseId}:${visit.lessonNumber ?? ''}:${visit.taskId ?? ''}`;
  try {
    const last = Number(sessionStorage.getItem(key));
    if (last && Date.now() - last < REPEAT_MS) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // no session storage: every opening counts
  }
  supabase
    .from('lms_visits')
    .insert({ course_id: visit.courseId, lesson_number: visit.lessonNumber ?? null, task_id: visit.taskId ?? null })
    .then(({ error }) => error && console.warn('Visit not saved', error));
}
