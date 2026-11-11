import { createEditor, setDoc } from './editor';
import type { Language } from './languages';
import { TimedOut, type CodeError, type RunResult } from './languages/types';
import { loadDraft, saveDraft, saveAttempt, lastAttemptCode } from './progress';
import { taskState } from './state';
import { modelUsageText } from './model-usage';
import { askInConsole } from './console-input';
import { codeSizeButtons } from './code-size';
import { fullscreenButton } from './fullscreen';

export type WorkspaceOptions = {
  language: Language;
  /** Key for the local draft: task id, or "sandbox". */
  draftKey: string;
  starterCode: string;
  starterStdin?: string;
  /** Present for checked tasks; absent in the sandbox. */
  task?: { id: string; tests: string };
  /** What "Pełny ekran" spreads over the window (the task with its text); by default the workspace alone. */
  fullscreen?: { scope: HTMLElement; onChange?: (on: boolean) => void };
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
  const { language } = options;
  const runner = language.runner;
  const hasTests = Boolean(options.task?.tests);

  root.hidden = false;
  $('.file-name').textContent = language.fileName;
  runButton.hidden = !runner;
  checkButton.hidden = !hasTests || !runner;
  $('.stdin').hidden = !runner;
  resetButton.hidden = !options.task;
  if (options.starterStdin) {
    stdin.value = options.starterStdin;
    $<HTMLDetailsElement>('.stdin').open = true;
  }

  const draft = loadDraft(options.draftKey);
  const editor = createEditor($('.editor'), draft ?? options.starterCode, language, (code) => {
    taskState.code = code;
    saveDraft(options.draftKey, code);
  });
  taskState.code = editor.state.doc.toString();
  // No draft in this browser: continue from the last attempt (e.g. the student switched computers).
  if (options.task && draft === null) lastAttemptCode(options.task.id).then((code) => code && setDoc(editor, code));

  const console_ = $('.console');
  const terminal = $('.terminal');
  const stopButton = $<HTMLButtonElement>('.stop');
  $('.tools').append(
    codeSizeButtons(() => editor.requestMeasure()),
    fullscreenButton(options.fullscreen?.scope ?? root, (on) => {
      // the console has its own column in full screen, so it shows before the first run too
      if (on && console_.hidden) {
        console_.hidden = false;
        terminal.textContent = '(tu pojawi się wynik programu)';
        terminal.classList.add('empty');
      }
      editor.requestMeasure();
      options.fullscreen?.onChange?.(on);
    }),
  );

  let runnerReady = false;
  const busy = (yes: boolean, text = '') => {
    runButton.disabled = yes || !runnerReady;
    checkButton.disabled = yes || !runnerReady;
    status.textContent = text;
  };
  if (runner) {
    runner.prepare().then(
      () => {
        runnerReady = true;
        busy(false);
        if (runner.consoleInput?.()) {
          $('.stdin .hint').textContent = 'Program zapyta o dane w oknie wyniku. Tu możesz wpisać odpowiedzi z góry, każdą w osobnej linijce: dostanie je najpierw.';
        }
      },
      (e) => (status.textContent = `${e.message}. Odśwież stronę.`),
    );
  } else {
    status.textContent = `Kodu w języku ${language.label} nie da się jeszcze uruchomić na stronie. Napisz go w swoim edytorze.`;
  }

  function showError(error: CodeError | null) {
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
    console_.hidden = false;
    terminal.textContent = r.output || (r.error || r.stopped ? '' : '(program nic nie wypisał)');
    if (r.stopped) terminal.append(el('span', `${r.output.endsWith('\n') || !r.output ? '' : '\n'}(program zatrzymany)`, 'stopped'));
    terminal.classList.toggle('empty', !r.output && !r.stopped);
    terminal.hidden = !r.output && Boolean(r.error);
    $('.time').textContent = [ms ? `${(ms / 1000).toFixed(2)} s` : '', modelUsageText(r.llm)].filter(Boolean).join(' · ');
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
        hint: 'Może pętla nigdy się nie kończy? Sprawdź warunek i to, czy coś w pętli go zmienia.',
      },
    });
  }

  async function run() {
    if (!runner || runButton.disabled) return;
    busy(true, 'Uruchamiam…');
    $('.results').hidden = true;
    const started = performance.now();
    // the time shown is computing only, without the student's thinking
    let waited = 0;
    const answer = async (output: string) => {
      const asked = performance.now();
      console_.hidden = false;
      terminal.hidden = false;
      showError(null);
      status.textContent = 'Program czeka na odpowiedź w oknie wyniku.';
      const reply = await askInConsole(terminal, output, stopButton);
      status.textContent = 'Uruchamiam…';
      waited += performance.now() - asked;
      return reply;
    };
    try {
      const result = await runner.run(editor.state.doc.toString(), stdin.value, answer);
      showOutput(result, performance.now() - started - waited);
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
    // the draft saves itself on every change; Ctrl+S only says so instead of the browser's "Save page"
    if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      status.textContent = 'Zapisane w tej przeglądarce.';
    }
  });

  checkButton.addEventListener('click', async () => {
    if (!options.task || !runner) return;
    const code = editor.state.doc.toString();
    busy(true, 'Sprawdzam…');
    try {
      const result = await runner.check(code, options.task.tests);
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
