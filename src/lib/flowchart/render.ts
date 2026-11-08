// Draws the laid-out charts as SVG (classes only, so light and dark themes work) and shows one step:
// the current node, the edge taken next, a decision's value, loop badges and a marker that moves
// along the edge it came by.
import { CALL_GAP, shorten } from './layout';
import type { Chart, ChartEdge, ChartNode } from './model';
import type { StepView } from './progress';

const NS = 'http://www.w3.org/2000/svg';
type Point = [number, number];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

const pointsAttr = (points: Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function shape(n: ChartNode): SVGElement {
  const l = n.x - n.w / 2;
  const t = n.y - n.h / 2;
  const r = l + n.w;
  const b = t + n.h;
  switch (n.shape) {
    case 'terminal':
      return svg('rect', { x: l, y: t, width: n.w, height: n.h, rx: n.h / 2 });
    case 'process':
      return svg('rect', { x: l, y: t, width: n.w, height: n.h, rx: 6 });
    case 'jump':
      return svg('rect', { x: l, y: t, width: n.w, height: n.h, rx: 10 });
    case 'io':
      return svg('polygon', { points: pointsAttr([[l + 8, t], [r, t], [r - 8, b], [l, b]]) });
    case 'decision':
      return svg('polygon', { points: pointsAttr([[n.x, t], [r, n.y], [n.x, b], [l, n.y]]) });
    case 'loop':
      return svg('polygon', { points: pointsAttr([[l + 12, t], [r - 12, t], [r, n.y], [r - 12, b], [l + 12, b], [l, n.y]]) });
  }
}

function arrowHead([x1, y1]: Point, [x2, y2]: Point): SVGPolygonElement {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - 8 * Math.cos(a);
  const by = y2 - 8 * Math.sin(a);
  const p1: Point = [bx + 4 * Math.sin(a), by - 4 * Math.cos(a)];
  const p2: Point = [bx - 4 * Math.sin(a), by + 4 * Math.cos(a)];
  return svg('polygon', { class: 'fc-head', points: pointsAttr([[x2, y2], p1, p2]) });
}

function edgeGroup(e: ChartEdge): SVGGElement {
  const g = svg('g', { class: `fc-edge fc-${e.kind}`, 'data-edge': e.id });
  g.append(svg('polyline', { points: pointsAttr(e.points) }), arrowHead(e.points.at(-2)!, e.points.at(-1)!));
  if (e.label) {
    const [[x1, y1], [x2, y2]] = e.points;
    const vertical = x1 === x2;
    const at = vertical ? { x: x1 + 6, y: Math.min(y1, y2) + 14, 'text-anchor': 'start' } : { x: (x1 + x2) / 2, y: y1 - 6, 'text-anchor': 'middle' };
    g.append(svg('text', { class: 'fc-label', ...at }, e.label));
  }
  return g;
}

function nodeGroup(n: ChartNode): SVGGElement {
  const g = svg('g', { class: `fc-node fc-${n.shape}`, 'data-node': n.id });
  g.append(svg('title', {}, n.text), shape(n), svg('text', { class: 'fc-text', x: n.x, y: n.y + 4.5, 'text-anchor': 'middle' }, shorten(n.text)));
  if (n.calls.length) g.append(svg('text', { class: 'fc-call', x: n.x + n.w / 2 + CALL_GAP, y: n.y + 4, 'text-anchor': 'start' }, `↗ ${n.calls.join(', ')}`));
  return g;
}

const marker = (n: ChartNode): Point => [n.x - n.w / 2 - 9, n.y];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountFlowchart(charts: Chart[], views: StepView[]) {
  const element = document.createElement('div');
  element.className = 'flowchart';
  const nodes = new Map<string, { node: ChartNode; g: SVGGElement; text: SVGTextElement }>();
  const edges = new Map<string, { edge: ChartEdge; g: SVGGElement }>();
  const parts = new Map<string, { figure: HTMLElement; svg: SVGSVGElement; dot: SVGCircleElement; badges: SVGGElement; chart: Chart }>();

  for (const chart of charts) {
    const key = chart.name ?? 'main';
    const figure = document.createElement('figure');
    figure.className = 'flowchart-chart';
    if (chart.name) {
      const caption = document.createElement('figcaption');
      caption.textContent = `funkcja ${chart.name}`;
      figure.append(caption);
    }
    const root = svg('svg', { viewBox: `0 0 ${chart.width} ${chart.height}`, role: 'img', 'aria-label': chart.name ? `Schemat funkcji ${chart.name}` : 'Schemat programu' });
    root.style.width = `${chart.width}px`;
    root.style.minWidth = `${Math.round(chart.width * 0.85)}px`;
    for (const e of chart.edges) {
      const g = edgeGroup(e);
      edges.set(e.id, { edge: e, g });
      root.append(g);
    }
    for (const n of chart.nodes) {
      const g = nodeGroup(n);
      nodes.set(n.id, { node: n, g, text: g.querySelector<SVGTextElement>('.fc-text')! });
      root.append(g);
    }
    const badges = svg('g', { class: 'fc-badges' });
    const dot = svg('circle', { class: 'fc-dot', r: 6, cx: -20, cy: -20 });
    root.append(badges, dot);
    figure.append(root);
    element.append(figure);
    parts.set(key, { figure, svg: root, dot, badges, chart });
  }

  function badge(target: ChartNode, text: string): SVGGElement {
    const w = text.length * 6.6 + 14;
    // over the top-left corner: the right side carries the "nie" / "koniec" label of the way out
    const x = target.x - target.w / 2 - 4;
    const y = target.y - target.h / 2 - 12;
    const g = svg('g', { class: 'fc-badge' });
    g.append(svg('rect', { x, y, width: w, height: 18, rx: 9 }), svg('text', { x: x + w / 2, y: y + 12.5, 'text-anchor': 'middle' }, text));
    return g;
  }

  function show(i: number, animate: boolean) {
    const view = views[i];
    if (!view) return;
    element.querySelectorAll('.fc-current, .fc-chosen, .fc-error').forEach((e) => e.classList.remove('fc-current', 'fc-chosen', 'fc-error'));
    for (const { node, text } of nodes.values()) text.textContent = shorten(node.text);
    const current = nodes.get(view.node)!;
    current.g.classList.add('fc-current');
    if (view.error) current.g.classList.add('fc-error');
    if (view.decision) current.text.textContent = view.decision;
    if (view.edge) edges.get(view.edge)?.g.classList.add('fc-chosen');

    for (const [key, part] of parts) {
      part.badges.replaceChildren();
      part.dot.style.display = key === view.chart ? '' : 'none';
    }
    const part = parts.get(view.chart)!;
    for (const b of view.badges) part.badges.append(badge(nodes.get(b.node)!.node, b.text));

    const [tx, ty] = marker(current.node);
    part.dot.setAttribute('cx', String(tx));
    part.dot.setAttribute('cy', String(ty));
    const path = view.from ? [...edges.values()].find(({ edge }) => edge.from === view.from && edge.to === view.node)?.edge.points : undefined;
    if (animate && path && !reducedMotion()) {
      const route: Point[] = [marker(nodes.get(view.from!)!.node), ...path, [tx, ty]];
      part.dot.animate(route.map(([x, y]) => ({ transform: `translate(${x - tx}px, ${y - ty}px)` })), { duration: 450, easing: 'ease-in-out' });
    }

    const { figure, svg: root, chart } = part;
    if (figure.scrollWidth > figure.clientWidth) {
      const scale = root.clientWidth / chart.width;
      figure.scrollLeft = current.node.x * scale - figure.clientWidth / 2;
    }
  }

  return { element, show };
}
