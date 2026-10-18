// Graded hints under a task. The first unlocks after FIRST_AFTER failed checks, each next one after
// one more failed check; a teacher, or a student who already passed, can open all of them.
// How many the student has opened is remembered in this browser only.
import { supabase, currentUser } from './supabase';
import { renderMarkdown } from './markdown';

const FIRST_AFTER = 2;
const openedKey = (taskId: string) => `kurs:hints:${taskId}`;

function loadOpened(taskId: string): number {
  try {
    return Number(localStorage.getItem(openedKey(taskId))) || 0;
  } catch {
    return 0;
  }
}

function saveOpened(taskId: string, count: number) {
  try {
    localStorage.setItem(openedKey(taskId), String(count));
  } catch {
    // private mode: opened hints are simply not remembered
  }
}

const plural = (n: number) => (n === 1 ? 'nieudanym sprawdzeniu' : 'nieudanych sprawdzeniach');

export async function mountHints(root: HTMLElement, task: { id: string; hints: string[] }, isTeacher: boolean) {
  if (!task.hints?.length) return;
  const user = await currentUser();
  const { data } = user
    ? await supabase.from('lms_attempts').select('passed').eq('user_id', user.id).eq('task_id', task.id)
    : { data: [] };
  let failed = (data ?? []).filter((a) => !a.passed).length;
  let passed = (data ?? []).some((a) => a.passed);
  let opened = loadOpened(task.id);

  const list = root.querySelector<HTMLOListElement>('.hint-list')!;
  const button = root.querySelector<HTMLButtonElement>('.hint-button')!;
  const info = root.querySelector<HTMLParagraphElement>('.hint-info')!;

  const available = () => (isTeacher || passed ? task.hints.length : Math.min(task.hints.length, Math.max(0, failed - FIRST_AFTER + 1)));

  function render() {
    opened = Math.min(opened, task.hints.length);
    list.replaceChildren(
      ...task.hints.slice(0, opened).map((hint) => {
        const li = document.createElement('li');
        li.innerHTML = renderMarkdown(hint);
        return li;
      }),
    );
    const canOpen = opened < available();
    button.hidden = !canOpen;
    button.textContent = `Pokaż podpowiedź ${opened + 1} z ${task.hints.length}`;
    if (opened >= task.hints.length) info.textContent = '';
    else if (canOpen) info.textContent = '';
    else if (opened === 0) {
      const left = FIRST_AFTER - failed;
      info.textContent = `Podpowiedź odblokuje się po ${FIRST_AFTER} ${plural(FIRST_AFTER)}${failed ? ` (zostało ${left})` : ''}. Najpierw spróbuj sam.`;
    } else info.textContent = 'Kolejna podpowiedź odblokuje się po następnym nieudanym sprawdzeniu.';
    info.hidden = !info.textContent;
  }

  button.addEventListener('click', () => {
    opened += 1;
    saveOpened(task.id, opened);
    render();
  });
  // saveAttempt() announces every check, so hints unlock without reloading the page
  window.addEventListener('kurs:attempt', (e) => {
    const detail = (e as CustomEvent<{ taskId: string; passed: boolean }>).detail;
    if (detail.taskId !== task.id) return;
    if (detail.passed) passed = true;
    else failed += 1;
    render();
  });
  render();
  root.hidden = false;
}
