// A task done on the student's computer (kind: local): Postgres, Docker, an SDK with an API key, the cloud.
// Nothing runs on the page; the student hands in a repo link or a short description. It is saved as an
// attempt (shown in the teacher dashboard like any other) and marks the task as done.
import { loadDraft, saveDraft, saveAttempt, lastAttemptCode } from './progress';
import { taskState } from './state';

export function mountLocalTask(root: HTMLElement, task: { id: string }) {
  const field = root.querySelector<HTMLTextAreaElement>('textarea')!;
  const button = root.querySelector<HTMLButtonElement>('.hand-in')!;
  const status = root.querySelector<HTMLElement>('.status')!;
  root.hidden = false;

  const draft = loadDraft(task.id);
  field.value = draft ?? '';
  if (draft === null) lastAttemptCode(task.id).then((handedIn) => handedIn && ((field.value = handedIn), (status.textContent = 'Już oddane. Możesz poprawić i oddać jeszcze raz.')));
  taskState.code = field.value;
  field.addEventListener('input', () => {
    saveDraft(task.id, field.value);
    taskState.code = field.value;
  });

  button.addEventListener('click', async () => {
    const text = field.value.trim();
    if (!text) {
      status.textContent = 'Wklej link albo opisz swoją pracę.';
      field.focus();
      return;
    }
    button.disabled = true;
    await saveAttempt(task.id, text, true, { kind: 'local' });
    button.disabled = false;
    status.textContent = 'Oddane. Nauczyciel zobaczy to w panelu.';
  });
}
