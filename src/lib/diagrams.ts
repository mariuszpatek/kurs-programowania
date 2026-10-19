// Drawings in lessons: lessons/img/*.svg, put in a lesson as ![caption](img/name.svg) and inlined
// by sync-content (scripts/content.mjs), so they are as private as the lesson and follow the theme.
//
// Drawings use the shared classes from lesson-widgets.css (.box, .str, .num, .label, .arrow …) instead
// of colours, so every drawing matches the site and the dark theme.
//
// Step by step: <svg data-steps="3">. On any element:
//   data-step="2"       appears at step 2 and stays
//   data-only="2"       visible at step 2 only
//   data-from="-40,90"  flies in from 40 left and 90 down (SVG units) when it appears
//   data-delay="120"    waits 120 ms before moving (a cascade, e.g. candies one after another)
// <desc data-step="2"> is the caption under the drawing at step 2.
import { stepControls } from './step-controls';

function mountSteps(figure: HTMLElement, svg: SVGSVGElement) {
  const total = Number(svg.dataset.steps);
  const caption = document.createElement('p');
  caption.className = 'diagram-caption';
  caption.setAttribute('aria-live', 'polite');
  figure.tabIndex = -1;

  const moving = [...svg.querySelectorAll<SVGElement>('[data-step]:not(desc), [data-only]')];
  for (const node of moving) {
    if (node.dataset.delay) node.style.transitionDelay = `${node.dataset.delay}ms`;
  }

  let at = 0;
  const controls = stepControls(go, figure);
  figure.append(caption, controls.element);

  function go(to: number) {
    at = Math.max(0, Math.min(total - 1, to));
    const step = at + 1;
    for (const node of moving) {
      const hidden = node.dataset.only ? Number(node.dataset.only) !== step : Number(node.dataset.step) > step;
      node.classList.toggle('step-hidden', hidden);
      if (node.dataset.from) {
        const [dx, dy] = node.dataset.from.split(',').map(Number);
        node.style.transform = hidden ? `translate(${dx}px, ${dy}px)` : '';
      }
    }
    caption.textContent = svg.querySelector(`desc[data-step="${step}"]`)?.textContent ?? '';
    controls.update(at, total);
  }
  go(0);
}

/** Adds step controls to drawings that have them. Called by enhanceContent() after rendering. */
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
