import type { Language } from './languages';
import { loadDraft, saveDraft, saveAttempt } from './progress';
import { taskState } from './state';

const el = (tag: string, text = '', className = '') => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};

/** Wires up the markup of components/Predict.astro. */
export function mountPredict(root: HTMLElement, task: { id: string; predict_code: string }, language: Language) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const guess = $<HTMLTextAreaElement>('textarea');
  const checkButton = $<HTMLButtonElement>('.check');
  const status = $('.status');
  const code = task.predict_code.replace(/\n$/, '');

  const runner = language.runner;
  root.hidden = false;
  $('.file-name').textContent = language.fileName.replace(/^[^.]*/, 'zagadka');
  $('.code').innerHTML = language.highlight(code)
    .split('\n')
    .map((line, i) => `<span class="line"><span class="ln">${i + 1}</span>${line || ' '}</span>`)
    .join('');
  taskState.code = code;
  guess.value = loadDraft(task.id) ?? '';
  guess.addEventListener('input', () => saveDraft(task.id, guess.value));

  if (runner) {
    runner.prepare().then(
      () => ((checkButton.disabled = false), (status.textContent = '')),
      (e) => (status.textContent = `${e.message}. Odśwież stronę.`),
    );
  } else {
    status.textContent = `Sprawdzanie dla języka ${language.label} nie jest jeszcze dostępne.`;
  }

  checkButton.addEventListener('click', async () => {
    if (!runner) return;
    checkButton.disabled = true;
    try {
      const result = await runner.predict(code, guess.value);
      const right = result.lines.filter((l) => l.ok).length;
      const verdict = $('.verdict');
      verdict.className = `verdict ${result.passed ? 'passed' : ''}`;
      verdict.replaceChildren(
        el('strong', result.passed ? 'Wszystko się zgadza' : `Zgadza się ${right} z ${result.lines.length}`),
        el('span', result.passed ? 'Przewidziałeś każdą linijkę.' : 'Zastanów się, dlaczego w zaznaczonych linijkach wyszło inaczej.'),
      );
      $('tbody').replaceChildren(
        ...result.lines.map((l, i) => {
          const tr = el('tr', '', l.ok ? 'ok' : 'bad');
          tr.append(el('td', String(i + 1)), el('td', l.student ?? '(brak)'), el('td', l.actual ?? '(nic)'));
          return tr;
        }),
      );
      $('.comparison').hidden = false;
      taskState.lastResult = `Odpowiedź ucznia:\n${guess.value}\nZgodnych linijek: ${right} z ${result.lines.length}`;
      await saveAttempt(task.id, guess.value, result.passed, result.lines);
    } catch (e) {
      status.textContent = String(e);
    }
    checkButton.disabled = false;
  });
}
