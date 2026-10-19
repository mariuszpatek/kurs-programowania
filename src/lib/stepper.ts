// "Step by step" under a lesson example. A ```python krok fence gets a button that runs the
// example once, records the state after every line (checker.trace) and lets the student walk
// through it: the line just executed, the variables with their types, and what is on the screen.
// Words after "krok" are the answers for input(), one per line: ```python krok 16 Ola
import { escapeHtml } from './languages/highlight';
import { TimedOut, type Language, type TraceStep } from './languages/types';

type Change = { name: string; value: string; before: string | null };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
};

const code = (text: string) => `<code>${escapeHtml(text)}</code>`;

/** What changed between two steps: new variables and new values. */
function changes(before: TraceStep | undefined, after: TraceStep): Change[] {
  const old = new Map((before?.variables ?? []).map((v) => [v.name, v.value]));
  return after.variables
    .filter((v) => old.get(v.name) !== v.value)
    .map((v) => ({ name: v.name, value: v.value, before: old.get(v.name) ?? null }));
}

function caption(steps: TraceStep[], i: number): string {
  const step = steps[i];
  if (step.line === null) {
    const first = steps[1]?.line;
    return first ? `Program jeszcze nie ruszył. Kliknij „Dalej”, a Python wykona linijkę ${first}.` : 'Ten program nic nie robi.';
  }
  if (step.error && step.error.type !== 'TooManySteps') {
    const hint = step.error.hint ? ` ${escapeHtml(step.error.hint)}` : '';
    return `Linijka ${step.line} kończy się błędem: ${code(step.error.message)}.${hint}`;
  }
  const parts = [`Python wykonał linijkę ${step.line}.`];
  for (const c of changes(steps[i - 1], step)) {
    parts.push(
      c.before === null
        ? `Powstała zmienna ${code(c.name)} z wartością ${code(c.value)}.`
        : `${code(c.name)} ma teraz wartość ${code(c.value)} (było ${code(c.before)}).`,
    );
  }
  const printed = step.output.slice(steps[i - 1].output.length).replace(/\n$/, '');
  if (printed) parts.push(`Na ekranie pojawiło się: ${code(printed)}.`);
  if (step.error) parts.push(escapeHtml(step.error.message));
  else if (i === steps.length - 1) parts.push('To koniec programu.');
  return parts.join(' ');
}

function variablesView(steps: TraceStep[], i: number): HTMLElement[] {
  const step = steps[i];
  if (!step.variables.length) return [el('p', 'stepper-empty', 'Jeszcze nie ma żadnych zmiennych.')];
  const changed = new Map(changes(steps[i - 1], step).map((c) => [c.name, c.before === null ? 'new' : 'changed']));
  return step.variables.map((v) => {
    const row = el('div', `stepper-var type-${['str', 'int', 'float', 'bool'].includes(v.type) ? v.type : 'other'} ${changed.get(v.name) ?? ''}`);
    row.append(el('span', 'var-name', v.name), el('span', 'var-value', v.value), el('span', 'var-type', v.type));
    return row;
  });
}

/** Builds the player under `anchor` and records the program. */
export function mountStepper(anchor: HTMLElement, source: string, language: Language, stdin: string): HTMLElement {
  const root = el('section', 'stepper');
  root.setAttribute('aria-label', 'Program krok po kroku');
  root.tabIndex = -1;

  const lines = source.replace(/\n$/, '').split('\n');
  const codeList = el('ol', 'stepper-code');
  const lineItems = lines.map((line, n) => {
    const li = el('li');
    li.innerHTML = `<span class="ln">${n + 1}</span><code>${language.highlight(line) || ' '}</code>`;
    codeList.append(li);
    return li;
  });
  const legend = el('p', 'stepper-legend');
  legend.innerHTML = '<span class="mark-done"></span> właśnie wykonana <span class="mark-next"></span> następna';

  const vars = el('div', 'stepper-vars');
  const output = el('pre', 'stepper-output');
  const state = el('div', 'stepper-state');
  state.append(el('p', 'eyebrow', 'Zmienne'), vars, el('p', 'eyebrow', 'Na ekranie'), output);

  const left = el('div', 'stepper-left');
  left.append(codeList, legend);
  const body = el('div', 'stepper-body');
  body.append(left, state);

  const text = el('p', 'stepper-caption');
  text.setAttribute('aria-live', 'polite');
  const prev = el('button', 'ghost', '◀ Wstecz');
  const count = el('span', 'stepper-count');
  const next = el('button', 'primary', 'Dalej ▶');
  const restart = el('button', 'ghost', 'Od początku');
  const controls = el('div', 'stepper-controls');
  controls.append(prev, count, next, restart);

  root.append(body, text, controls);
  anchor.after(root);

  let steps: TraceStep[] = [];
  let i = 0;

  function render() {
    const step = steps[i];
    const following = steps[i + 1];
    lineItems.forEach((li, n) => {
      li.classList.toggle('done', step.line === n + 1);
      li.classList.toggle('next', following?.line === n + 1 && !step.error);
      li.classList.toggle('failed', step.line === n + 1 && Boolean(step.error) && step.error!.type !== 'TooManySteps');
    });
    vars.replaceChildren(...variablesView(steps, i));
    output.textContent = step.output || 'Na razie nic.';
    output.classList.toggle('empty', !step.output);
    text.innerHTML = caption(steps, i);
    count.textContent = `Krok ${i + 1} z ${steps.length}`;
    prev.disabled = i === 0;
    next.disabled = i === steps.length - 1;
    restart.hidden = i === 0;
  }

  const go = (to: number) => {
    i = Math.max(0, Math.min(steps.length - 1, to));
    render();
  };
  prev.addEventListener('click', () => go(i - 1));
  next.addEventListener('click', () => go(i + 1));
  restart.addEventListener('click', () => go(0));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else return;
    e.preventDefault();
  });

  for (const b of [prev, next]) b.disabled = true;
  restart.hidden = true;
  text.textContent = 'Uruchamiam Pythona… Za pierwszym razem trwa to kilka sekund.';
  language
    .runner!.trace!(source, stdin)
    .then((result) => {
      if (!result.steps.length) {
        text.innerHTML = result.error ? `Ten kod się nie uruchomi: ${code(result.error.message)}` : 'Ten program nic nie robi.';
        return;
      }
      steps = result.steps;
      go(0);
      root.focus({ preventScroll: true });
    })
    .catch((err) => {
      text.textContent =
        err instanceof TimedOut ? 'Program działał za długo. Czy to nie pętla bez końca?' : `Nie udało się uruchomić programu: ${err.message}`;
    });
  return root;
}
