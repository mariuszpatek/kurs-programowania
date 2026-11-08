// Turns the recorded steps (checker.trace) into what the flowchart shows at each step: the node of
// the line just executed, the edge taken next, a decision's value and the loop rounds.
import type { TraceStep } from '../languages/types';
import type { Chart, ChartNode } from './model';

export type StepView = {
  chart: string;
  node: string;
  /** The node the marker comes from on the same chart (null: no animation). */
  from: string | null;
  /** The edge taken next: from this node to the next step's node. */
  edge: string | null;
  /** For a decision: "3 > 0 → tak". */
  decision: string | null;
  badges: { node: string; text: string }[];
  error: boolean;
};

function decisionText(step: TraceStep): string | null {
  const last = [...step.parts].reverse().find((p) => p.value === 'True' || p.value === 'False');
  return last ? `${last.before} → ${last.value === 'True' ? 'tak' : 'nie'}` : null;
}

export function progress(charts: Chart[], steps: TraceStep[]): StepView[] {
  const nodes = charts.flatMap((c) => c.nodes);
  const edges = charts.flatMap((c) => c.edges);
  const byLine = new Map<string, ChartNode>();
  for (const n of nodes) if (n.line !== null && !byLine.has(`${n.chart}:${n.line}`)) byLine.set(`${n.chart}:${n.line}`, n);
  const start = charts[0].nodes[0];
  const loops = nodes.filter((n) => n.inner);
  const inside = (loop: ChartNode, node: ChartNode | null) => Boolean(node && loop.inner!.includes(node.id));

  // the def line of a function and similar lines have no node: the marker stays where it was
  const placed: ChartNode[] = [];
  steps.forEach((step, i) => {
    const found = step.line === null ? null : byLine.get(`${step.frame ?? 'main'}:${step.line}`);
    placed.push(found ?? placed[i - 1] ?? start);
  });

  const rounds = new Map<string, number>();
  return steps.map((step, i) => {
    const node = placed[i];
    const prev = placed[i - 1] ?? null;
    const next = placed[i + 1] ?? null;
    for (const loop of loops) {
      if (node === loop && !inside(loop, prev)) rounds.set(loop.id, 0);
      if (prev === loop && inside(loop, node)) rounds.set(loop.id, (rounds.get(loop.id) ?? 0) + 1);
    }
    const vars = step.frame ? step.locals ?? [] : step.variables;
    const badges = loops
      .filter((loop) => loop === node || inside(loop, node))
      .map((loop) => {
        const round = rounds.get(loop.id) ?? 0;
        const parts = round > 0 ? [`obrót ${round}`] : [];
        if (loop.target) {
          const value = vars.find((v) => v.name === loop.target)?.value;
          if (loop === node && !inside(loop, next)) parts.push('koniec listy');
          else if (value !== undefined) parts.push(`${loop.target} = ${value}`);
        }
        return { node: loop.id, text: parts.join(' · ') };
      })
      .filter((b) => b.text);
    return {
      chart: node.chart,
      node: node.id,
      from: prev && prev.chart === node.chart && prev !== node ? prev.id : null,
      edge: next ? edges.find((e) => e.from === node.id && e.to === next.id)?.id ?? null : null,
      decision: node.shape === 'decision' ? decisionText(step) : null,
      badges,
      error: Boolean(step.error) && step.error!.type !== 'TooManySteps',
    };
  });
}
