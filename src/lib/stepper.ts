// "Step by step" under a lesson example. A ```python krok fence gets a button that runs the
// example once, records the state after every line (checker.trace) and lets the student walk
// through it: the line just executed, the variables with their types, and what is on the screen.
// With "Pokaż liczenie w linijce" on, every line is also taken apart like Thonny's "step into":
// age = int(input(...)) → age = int('16') → age = 16.
// Words after "krok" are the answers for input(), one per line: ```python krok 16 Ola
import { escapeHtml } from './languages/highlight';
import { TimedOut, type Language, type TracePart, type TraceStep } from './languages/types';
import { stepControls } from './step-controls';

type Change = { name: string; value: string; before: string | null };
/** One click of "Dalej": a whole line (part null) or one value computed inside it. */
type Position = { step: number; part: number | null };

const DETAILED_KEY = 'kurs:stepper-detailed';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
};

const code = (text: string) => `<code>${escapeHtml(text)}</code>`;

function loadDetailed(): boolean {
  try {
    return localStorage.getItem(DETAILED_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveDetailed(on: boolean) {
  try {
    localStorage.setItem(DETAILED_KEY, on ? '1' : '0');
  } catch {
    // private mode: the choice is simply not remembered
  }
}

/** What changed between two steps: new variables and new values. */
function changes(before: TraceStep | undefined, after: TraceStep): Change[] {
  const old = new Map((before?.variables ?? []).map((v) => [v.name, v.value]));
  return after.variables
    .filter((v) => old.get(v.name) !== v.value)
    .map((v) => ({ name: v.name, value: v.value, before: old.get(v.name) ?? null }));
}

function lineCaption(steps: TraceStep[], i: number): string {
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

/** One value inside a line: a variable read, a function called, or an operation done. */
function partCaption(line: number, part: TracePart): string {
  if (/^[A-Za-z_]\w*$/.test(part.before)) {
    return `Linijka ${line}: Python sprawdza, co jest w zmiennej ${code(part.before)}. Jest tam ${code(part.value)}.`;
  }
  if (/^[A-Za-z_][\w.]*\(.*\)$/.test(part.before)) {
    return `Linijka ${line}: Python wywołuje ${code(part.before)} i dostaje ${code(part.value)}.`;
  }
  return `Linijka ${line}: ${code(part.before)} daje ${code(part.value)}.`;
}

function variablesView(current: TraceStep, previous: TraceStep | undefined): HTMLElement[] {
  if (!current.variables.length) return [el('p', 'stepper-empty', 'Jeszcze nie ma żadnych zmiennych.')];
  const changed = new Map(changes(previous, current).map((c) => [c.name, c.before === null ? 'new' : 'changed']));
  return current.variables.map((v) => {
    const row = el('div', `stepper-var type-${['str', 'int', 'float', 'bool'].includes(v.type) ? v.type : 'other'} ${changed.get(v.name) ?? ''}`);
    row.append(el('span', 'var-name', v.name), el('span', 'var-value', v.value), el('span', 'var-type', v.type));
    return row;
  });
}

/** The line being computed: plain text with the newest value marked. */
function partHtml(part: TracePart): string {
  return `${escapeHtml(part.text.slice(0, part.from))}<mark>${escapeHtml(part.text.slice(part.from, part.to))}</mark>${escapeHtml(part.text.slice(part.to))}`;
}

/** Builds the player under `anchor` and records the program. */
export function mountStepper(anchor: HTMLElement, source: string, language: Language, stdin: string): HTMLElement {
  const root = el('section', 'stepper');
  root.setAttribute('aria-label', 'Program krok po kroku');
  root.tabIndex = -1;

  const lines = source.replace(/\n$/, '').split('\n');
  const codeList = el('ol', 'stepper-code');
  const highlighted = lines.map((line) => language.highlight(line) || ' ');
  const lineItems = lines.map((_, n) => {
    const li = el('li');
    li.innerHTML = `<span class="ln">${n + 1}</span><code>${highlighted[n]}</code><span class="line-tag"></span>`;
    codeList.append(li);
    return li;
  });

  const vars = el('div', 'stepper-vars');
  const output = el('pre', 'stepper-output');
  const state = el('div', 'stepper-state');
  state.append(el('p', 'eyebrow', 'Zmienne'), vars, el('p', 'eyebrow', 'Na ekranie'), output);

  const body = el('div', 'stepper-body');
  body.append(codeList, state);

  const text = el('p', 'stepper-caption');
  text.setAttribute('aria-live', 'polite');
  const detail = el('label', 'stepper-detail');
  const detailBox = el('input');
  detailBox.type = 'checkbox';
  detailBox.checked = loadDetailed();
  detail.append(detailBox, ' Pokaż liczenie w linijce');
  const controls = stepControls((to) => go(to), root, [detail]);

  root.append(body, text, controls.element);
  anchor.after(root);

  let steps: TraceStep[] = [];
  let positions: Position[] = [];
  let at = 0;

  function layout() {
    positions = steps.flatMap((step, i) => [
      ...(detailBox.checked ? (step.parts ?? []).map((_, p) => ({ step: i, part: p })) : []),
      { step: i, part: null },
    ]);
  }

  function setLine(n: number, kind: string, tag: string, html?: string) {
    const li = lineItems[n];
    li.className = kind;
    li.querySelector('code')!.innerHTML = html ?? highlighted[n];
    li.querySelector('.line-tag')!.textContent = tag;
  }

  function render() {
    const { step: i, part } = positions[at];
    const step = steps[i];
    lineItems.forEach((_, n) => setLine(n, '', ''));

    if (part !== null) {
      // inside a line: the variables and the screen are still as they were before this line
      const before = steps[i - 1];
      setLine(step.line! - 1, 'computing', '⋯ liczy', partHtml(step.parts[part]));
      vars.replaceChildren(...variablesView(before, before));
      output.textContent = before.output || 'Na razie nic.';
      output.classList.toggle('empty', !before.output);
      text.innerHTML = partCaption(step.line!, step.parts[part]);
    } else {
      const following = steps[i + 1];
      const failed = Boolean(step.error) && step.error!.type !== 'TooManySteps';
      if (following?.line && following.line !== step.line && !step.error) setLine(following.line - 1, 'next', '▶ następna');
      if (step.line !== null) setLine(step.line - 1, failed ? 'failed' : 'done', failed ? '✗ błąd' : '✓ wykonana');
      vars.replaceChildren(...variablesView(step, steps[i - 1]));
      output.textContent = step.output || 'Na razie nic.';
      output.classList.toggle('empty', !step.output);
      text.innerHTML = lineCaption(steps, i);
    }
    controls.update(at, positions.length);
  }

  function go(to: number) {
    if (!positions.length) return;
    at = Math.max(0, Math.min(positions.length - 1, to));
    render();
  }
  detailBox.addEventListener('change', () => {
    saveDetailed(detailBox.checked);
    if (!steps.length) return;
    const current = positions[at].step;
    layout();
    go(positions.findIndex((p) => p.step === current && p.part === null));
  });
  controls.update(0, 0);
  text.textContent = 'Uruchamiam Pythona… Za pierwszym razem trwa to kilka sekund.';
  language
    .runner!.trace!(source, stdin)
    .then((result) => {
      if (!result.steps.length) {
        text.innerHTML = result.error ? `Ten kod się nie uruchomi: ${code(result.error.message)}` : 'Ten program nic nie robi.';
        return;
      }
      steps = result.steps;
      layout();
      go(0);
      root.focus({ preventScroll: true });
    })
    .catch((err) => {
      text.textContent =
        err instanceof TimedOut ? 'Program działał za długo. Czy to nie pętla bez końca?' : `Nie udało się uruchomić programu: ${err.message}`;
    });
  return root;
}
