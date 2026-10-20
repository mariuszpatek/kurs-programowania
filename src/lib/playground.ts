// "Zmień i uruchom" under a lesson example: the example opens in place as a small editor, so the
// student can change a value and see what happens instead of only reading about it.
// Nothing is sent anywhere: the changed code stays in this browser (as a draft keyed by the original
// example), and "Przywróć" brings the original back. Loaded only when the button is clicked.
import type { EditorView } from '@codemirror/view';
import { createEditor, setDoc } from './editor';
import { TimedOut, type CodeError, type Language } from './languages/types';
import { mountStepper } from './stepper';
import { loadDraft, saveDraft, clearDraft } from './progress';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
};

/** Short stable key for an example: the same example keeps its changes even when the lesson around it changes. */
function exampleKey(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (Math.imul(hash, 31) + source.charCodeAt(i)) | 0;
  return `example:${(hash >>> 0).toString(36)}`;
}

function errorText(error: CodeError): string {
  const where = error.line ? `Błąd w linijce ${error.line}` : 'Błąd';
  return [`${where}: ${error.message}`, error.hint].filter(Boolean).join('\n');
}

/**
 * Opens the editor right after `listing` (the example's card) and hides the card while editing.
 * Returns a function that closes the editor again.
 */
export function mountPlayground(listing: HTMLElement, source: string, language: Language, stdinValue: string, onClose: () => void) {
  const runner = language.runner!;
  const key = exampleKey(source);
  const root = el('section', 'playground');
  root.setAttribute('aria-label', 'Przykład do zmieniania');

  const bar = el('div', 'playground-bar');
  const status = el('span', 'playground-status', 'Zmieniaj kod i uruchamiaj. Oryginał wróci po „Przywróć”.');
  const close = el('button', 'ghost', 'Zamknij');
  close.type = 'button';
  bar.append(el('span', 'playground-label', `${language.label} · Twoja wersja`), status, close);

  const editorBox = el('div', 'playground-editor');

  const stdin = el('details', 'playground-stdin');
  const stdinField = el('textarea');
  stdinField.rows = 2;
  stdinField.spellcheck = false;
  stdinField.value = stdinValue;
  stdinField.setAttribute('aria-label', 'Dane dla input(), każda odpowiedź w osobnej linijce');
  const summary = el('summary');
  summary.append('Dane dla ', el('code', '', 'input()'));
  stdin.append(summary, stdinField);
  stdin.open = Boolean(stdinValue);

  const actions = el('div', 'playground-actions');
  const run = el('button', 'primary', 'Uruchom');
  run.append(el('kbd', '', 'Ctrl ↵'));
  const step = el('button', '', 'Krok po kroku');
  const reset = el('button', 'ghost', 'Przywróć');
  for (const b of [run, step, reset]) b.type = 'button';
  step.hidden = !runner.trace;
  actions.append(reset, step, run);

  const result = el('figure', 'code-block output playground-output');
  const caption = el('figcaption', '', 'Twój wynik');
  const output = el('pre');
  result.append(caption, output);
  result.hidden = true;

  root.append(bar, editorBox, stdin, actions, result);
  listing.after(root);
  listing.hidden = true;

  const editor: EditorView = createEditor(editorBox, loadDraft(key) ?? source, language, (code) => {
    if (code === source) clearDraft(key);
    else saveDraft(key, code);
  });
  editor.focus();

  let stepper: HTMLElement | null = null;
  const removeStepper = () => {
    stepper?.remove();
    stepper = null;
  };

  async function runCode() {
    if (run.disabled) return;
    run.disabled = true;
    removeStepper();
    status.textContent = 'Uruchamiam…';
    result.hidden = false;
    try {
      const r = await runner.run(editor.state.doc.toString(), stdinField.value);
      const text = [r.output.replace(/\n$/, ''), r.error && errorText(r.error)].filter(Boolean).join('\n\n');
      output.textContent = text || '(program nic nie wypisał)';
      result.classList.toggle('error', Boolean(r.error));
      caption.textContent = r.error ? 'Twój wynik: błąd' : 'Twój wynik';
      status.textContent = '';
    } catch (e) {
      output.textContent =
        e instanceof TimedOut ? 'Program działał za długo i został zatrzymany. Może czeka na dane dla input()?' : String(e);
      result.classList.add('error');
      status.textContent = '';
    }
    run.disabled = false;
  }

  run.addEventListener('click', runCode);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCode();
    }
  });
  step.addEventListener('click', () => {
    removeStepper();
    result.hidden = true;
    stepper = mountStepper(root, editor.state.doc.toString(), language, stdinField.value);
  });
  reset.addEventListener('click', () => {
    setDoc(editor, source);
    clearDraft(key);
    stdinField.value = stdinValue;
    result.hidden = true;
    removeStepper();
    status.textContent = 'Wrócił oryginalny przykład.';
  });
  close.addEventListener('click', () => {
    removeStepper();
    editor.destroy();
    root.remove();
    listing.hidden = false;
    onClose();
  });
  runner.prepare().catch((e) => (status.textContent = `${e.message}. Odśwież stronę.`));
}
