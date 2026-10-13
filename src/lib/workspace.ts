import { createEditor, setDoc } from './editor';
import { preparePython, runCode, checkCode, TimedOut, type PythonError, type RunResult } from './python';
import { loadDraft, saveDraft, saveAttempt, lastAttemptCode } from './progress';
import { taskState } from './state';

export type WorkspaceOptions = {
  /** Key for the local draft: task id, or "sandbox". */
  draftKey: string;
  starterCode: string;
  starterStdin?: string;
  /** Present for checked tasks; absent in the sandbox. */
  task?: { id: string; tests: string };
};

const el = (tag: string, text = '', className = '') => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};

/** Wires up the markup of components/Workspace.astro. */
export function mountWorkspace(root: HTMLElement, options: WorkspaceOptions) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const runButton = $<HTMLButtonElement>('.run');
  const checkButton = $<HTMLButtonElement>('.check');
  const resetButton = $<HTMLButtonElement>('.reset');
  const status = $('.status');
  const stdin = $<HTMLTextAreaElement>('.stdin textarea');
  const hasTests = Boolean(options.task?.tests);

  root.hidden = false;
  checkButton.hidden = !hasTests;
  resetButton.hidden = !options.task;
  if (options.starterStdin) {
    stdin.value = options.starterStdin;
    $<HTMLDetailsElement>('.stdin').open = true;
  }

  const draft = loadDraft(options.draftKey);
  const editor = createEditor($('.editor'), draft ?? options.starterCode, (code) => {
    taskState.code = code;
    saveDraft(options.draftKey, code);
  });
  taskState.code = editor.state.doc.toString();
  // No draft in this browser: continue from the last attempt (e.g. the student switched computers).
  if (options.task && draft === null) lastAttemptCode(options.task.id).then((code) => code && setDoc(editor, code));

  let pythonReady = false;
  const busy = (yes: boolean, text = '') => {
    runButton.disabled = yes || !pythonReady;
    checkButton.disabled = yes || !pythonReady;
    status.textContent = text;
  };
  preparePython().then(
    () => ((pythonReady = true), busy(false)),
    (e) => (status.textContent = `${e.message}. Odśwież stronę.`),
  );

  function showError(error: PythonError | null) {
    const box = $('.error');
    box.hidden = !error;
    if (!error) return;
    box.replaceChildren(
      el('div', error.line ? `Błąd w linijce ${error.line}` : 'Błąd', 'where'),
      ...(error.line_text ? [el('code', error.line_text)] : []),
      el('div', error.message, 'message'),
      ...(error.hint ? [el('div', error.hint, 'hint')] : []),
    );
  }

  function showOutput(r: RunResult, ms?: number) {
    const terminal = $('.terminal');
    $('.console').hidden = false;
    terminal.textContent = r.output || (r.error ? '' : '(program nic nie wypisał)');
    terminal.classList.toggle('empty', !r.output);
    terminal.hidden = !r.output && Boolean(r.error);
    $('.time').textContent = ms ? `${(ms / 1000).toFixed(2)} s` : '';
    showError(r.error);
    taskState.lastResult = `Wyjście:\n${r.output}\n${r.error ? `Błąd: ${r.error.message} (linijka ${r.error.line})` : ''}`;
  }

  function showTimeout() {
    showOutput({
      output: '',
      error: {
        type: 'Timeout',
        message: 'Program działał za długo i został zatrzymany.',
        line: null,
        line_text: null,
        hint: 'Może pętla nigdy się nie kończy albo program czeka na dane? Sprawdź pole „Dane dla input()”.',
      },
    });
  }

  async function run() {
    if (runButton.disabled) return;
    busy(true, 'Uruchamiam…');
    $('.results').hidden = true;
    const started = performance.now();
    try {
      showOutput(await runCode(editor.state.doc.toString(), stdin.value), performance.now() - started);
    } catch (e) {
      e instanceof TimedOut ? showTimeout() : (status.textContent = String(e));
    }
    busy(false);
  }

  runButton.addEventListener('click', run);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    }
  });

  checkButton.addEventListener('click', async () => {
    if (!options.task) return;
    const code = editor.state.doc.toString();
    busy(true, 'Sprawdzam…');
    try {
      const result = await checkCode(code, options.task.tests);
      if (result.run) showOutput(result.run);
      const passedCount = result.tests.filter((t) => t.ok).length;
      const verdict = $('.verdict');
      verdict.className = `verdict ${result.passed ? 'passed' : ''}`;
      verdict.replaceChildren(
        el('strong', result.passed ? 'Zadanie zaliczone' : `Zaliczone ${passedCount} z ${result.tests.length}`),
        el('span', result.passed ? 'Wszystkie sprawdzenia przeszły. Dobra robota.' : 'Popraw to, co niżej, i sprawdź jeszcze raz.'),
      );
      $('.results ul').replaceChildren(
        ...result.tests.map((t) => {
          const li = el('li', '', t.ok ? 'ok' : 'bad');
          li.append(el('span', t.ok ? '✓' : '✕', 'icon'), el('span', t.name, 'name'));
          if (t.message) li.append(el('span', t.message, 'message'));
          return li;
        }),
      );
      $('.results').hidden = false;
      taskState.lastResult += `\nSprawdzenie:\n${result.tests.map((t) => `${t.ok ? 'OK' : 'NIE'} ${t.name}${t.message ? `: ${t.message}` : ''}`).join('\n')}`;
      await saveAttempt(options.task.id, code, result.passed, result.tests);
    } catch (e) {
      e instanceof TimedOut ? showTimeout() : (status.textContent = String(e));
    }
    busy(false);
  });

  // Two clicks instead of confirm(): the first asks, a second one within 3 s restores the starter code.
  let confirmTimer: number | undefined;
  resetButton.addEventListener('click', () => {
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = undefined;
      setDoc(editor, options.starterCode);
      resetButton.textContent = 'Od nowa';
      return;
    }
    resetButton.textContent = 'Na pewno? Kliknij znowu';
    confirmTimer = window.setTimeout(() => {
      confirmTimer = undefined;
      resetButton.textContent = 'Od nowa';
    }, 3000);
  });
}
