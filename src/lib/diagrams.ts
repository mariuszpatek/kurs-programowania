// Drawings in lessons: lessons/img/*.svg, put in a lesson as ![caption](img/name.svg) and inlined
// by sync-content (scripts/content.mjs), so they are as private as the lesson and follow the theme.
//
// Drawings use the shared classes from global.css (.box, .str, .num, .label, .arrow …) instead of
// colours, so every drawing matches the site and the dark theme.
//
// A drawing with <svg data-steps="3"> is shown step by step: an element with data-step="2" appears
// at step 2 and stays, data-only="2" is visible at step 2 only, and <desc data-step="2"> is the
// caption under the drawing at that step.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
};

function mountSteps(figure: HTMLElement, svg: SVGSVGElement) {
  const total = Number(svg.dataset.steps);
  const caption = el('p', 'diagram-caption');
  caption.setAttribute('aria-live', 'polite');
  const prev = el('button', 'ghost', '◀ Wstecz');
  const count = el('span', 'stepper-count');
  const next = el('button', 'primary', 'Dalej ▶');
  const controls = el('div', 'stepper-controls');
  controls.append(prev, count, next);
  figure.append(caption, controls);

  let step = 1;
  const render = () => {
    for (const node of svg.querySelectorAll<SVGElement>('[data-step]:not(desc)')) {
      node.classList.toggle('step-hidden', Number(node.dataset.step) > step);
    }
    for (const node of svg.querySelectorAll<SVGElement>('[data-only]')) {
      node.classList.toggle('step-hidden', Number(node.dataset.only) !== step);
    }
    caption.textContent = svg.querySelector(`desc[data-step="${step}"]`)?.textContent ?? '';
    count.textContent = `Krok ${step} z ${total}`;
    prev.disabled = step === 1;
    next.disabled = step === total;
  };
  prev.addEventListener('click', () => ((step = Math.max(1, step - 1)), render()));
  next.addEventListener('click', () => ((step = Math.min(total, step + 1)), render()));
  render();
}

/** Adds step controls to drawings that have them. Call after inserting rendered lesson HTML. */
export function mountDiagrams(root: HTMLElement) {
  for (const figure of root.querySelectorAll<HTMLElement>('figure.diagram')) {
    const svg = figure.querySelector<SVGSVGElement>('svg[data-steps]');
    if (svg && !figure.querySelector('.stepper-controls')) mountSteps(figure, svg);
  }
}

/** Lesson Markdown with each drawing replaced by its caption (for the "copy lesson" export). */
export function drawingsAsText(md: string): string {
  return md.replace(/<figure class="diagram" data-alt="([^"]*)">[\s\S]*?<\/figure>/g, (_, alt: string) => `[Rysunek: ${alt.replace(/&quot;/g, '"')}]`);
}
