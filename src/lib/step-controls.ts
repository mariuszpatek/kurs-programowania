// Wstecz / Dalej / Odtwórz under anything shown step by step: the "Krok po kroku" player
// (stepper.ts) and step-by-step drawings (diagrams.ts). Arrow keys work while the widget has focus.

const PLAY_EVERY_MS = 1400;

export type StepControls = {
  element: HTMLElement;
  /** Shows step `at` (0-based) of `total`; call after every change, also from outside (e.g. a toggle). */
  update(at: number, total: number): void;
};

const button = (label: string, className: string) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
};

/**
 * `go(to)` moves to step `to` (clamped by the caller). `keyTarget` gets the arrow keys.
 * Extra elements (e.g. a checkbox) are appended after the buttons.
 */
export function stepControls(go: (to: number) => void, keyTarget: HTMLElement, extra: HTMLElement[] = []): StepControls {
  const prev = button('◀ Wstecz', 'ghost');
  const count = document.createElement('span');
  count.className = 'stepper-count';
  const next = button('Dalej ▶', 'primary');
  const play = button('▶ Odtwórz', 'ghost play');
  const restart = button('Od początku', 'ghost');
  const element = document.createElement('div');
  element.className = 'stepper-controls';
  element.append(prev, count, next, play, restart, ...extra);

  let at = 0;
  let total = 0;
  let timer: number | undefined;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    play.textContent = '▶ Odtwórz';
  };
  prev.addEventListener('click', () => (stop(), go(at - 1)));
  next.addEventListener('click', () => (stop(), go(at + 1)));
  restart.addEventListener('click', () => (stop(), go(0)));
  play.addEventListener('click', () => {
    if (timer) return stop();
    if (at >= total - 1) go(0);
    play.textContent = '⏸ Pauza';
    timer = window.setInterval(() => {
      go(at + 1);
      if (at >= total - 1) stop();
    }, PLAY_EVERY_MS);
  });
  keyTarget.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(at + 1);
    else if (e.key === 'ArrowLeft') go(at - 1);
    else return;
    stop();
    e.preventDefault();
  });

  return {
    element,
    update(newAt, newTotal) {
      at = newAt;
      total = newTotal;
      count.textContent = total ? `Krok ${at + 1} z ${total}` : '';
      prev.disabled = at === 0;
      next.disabled = at >= total - 1;
      play.disabled = total < 2;
      restart.hidden = at === 0;
    },
  };
}
