// input() in the console: the program's output so far, and a field for the answer right after its question
// (the task's and the sandbox's console, and "Zmień i uruchom" in a lesson). Styled in global.css.

/** Resolves with the answer on Enter (or its button), or null when `stop` ("Zatrzymaj") is clicked. */
export function askInConsole(terminal: HTMLElement, output: string, stop: HTMLButtonElement): Promise<string | null> {
  terminal.classList.remove('empty');
  terminal.textContent = output;
  const field = document.createElement('input');
  field.className = 'console-input';
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.placeholder = 'wpisz i naciśnij Enter';
  field.setAttribute('aria-label', 'Odpowiedź dla programu');
  // Enter is enough, but a button shows that the program waits for the answer to be sent
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'console-send';
  send.textContent = 'Enter ↵';
  send.setAttribute('aria-label', 'Wyślij odpowiedź');
  const answerBox = document.createElement('span');
  answerBox.append(field, send);
  terminal.append(answerBox);
  stop.hidden = false;
  field.focus();
  return new Promise((resolve) => {
    const finish = (answer: string | null) => {
      answerBox.replaceWith(answer === null ? '' : `${answer}\n`);
      stop.hidden = true;
      stop.removeEventListener('click', onStop);
      resolve(answer);
    };
    const onStop = () => finish(null);
    stop.addEventListener('click', onStop);
    send.addEventListener('click', () => finish(field.value));
    field.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      finish(field.value);
    });
  });
}
