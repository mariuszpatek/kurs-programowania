// Attempts live in Supabase (the teacher sees them); unsent drafts stay in this browser only.
import { supabase, currentUser } from './supabase';

const draftKey = (key: string) => `kurs:draft:${key}`;

export function loadDraft(key: string): string | null {
  try {
    return localStorage.getItem(draftKey(key));
  } catch {
    return null;
  }
}

export function saveDraft(key: string, code: string) {
  try {
    localStorage.setItem(draftKey(key), code);
  } catch {
    // private mode or full storage: the draft is simply not remembered
  }
}

export function hasDraft(key: string): boolean {
  return loadDraft(key) !== null;
}

export async function saveAttempt(taskId: string, code: string, passed: boolean, results: unknown) {
  const { error } = await supabase.from('lms_attempts').insert({ task_id: taskId, code, passed, results });
  if (error) console.warn('Attempt not saved', error);
}

export type TaskStatus = 'done' | 'started' | 'todo';

/** Status of each task for the signed-in user (a teacher sees attempts of everyone, so filter by self). */
export async function taskStatuses(taskIds: string[]): Promise<Map<string, TaskStatus>> {
  const result = new Map<string, TaskStatus>(taskIds.map((id) => [id, 'todo']));
  const user = await currentUser();
  if (!user || !taskIds.length) return result;
  const { data } = await supabase.from('lms_attempts').select('task_id, passed').eq('user_id', user.id).in('task_id', taskIds);
  for (const a of data ?? []) {
    if (a.passed) result.set(a.task_id, 'done');
    else if (result.get(a.task_id) !== 'done') result.set(a.task_id, 'started');
  }
  for (const id of taskIds) if (result.get(id) === 'todo' && hasDraft(id)) result.set(id, 'started');
  return result;
}

export async function lastAttemptCode(taskId: string): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data } = await supabase
    .from('lms_attempts')
    .select('code')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0]?.code ?? null;
}
