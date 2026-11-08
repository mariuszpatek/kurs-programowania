// Lays out a program (blocks from checker.flowchart) as flowcharts: one for the program and one per
// function. Pure functions, no DOM: render.ts draws the result, progress.ts walks it step by step.
//
// Python code is nested, so simple rules are enough (no general graph layout):
//   sequence  blocks one under another on a common axis
//   if/elif   decisions side by side (a ladder), each branch under its decision, all meeting below
//   loops     body under the check, the way back on the left, the way out ("nie") on the right
//   break     to the way out of the loop, continue back to its check, return to the end of the function
import type { Chart, ChartEdge, ChartNode, FlowBlock, FlowProgram, NodeShape } from './model';

type Point = [number, number];
/** A way out of a fragment that still has to be joined to whatever comes next. */
type Exit = { node: string; side: 'bottom' | 'right'; label: string; kind: ChartEdge['kind']; lane?: number };
/** A laid-out piece of a chart, on the axis x = 0 until shifted. */
type Fragment = {
  nodes: ChartNode[];
  edges: ChartEdge[];
  entry: string;
  exits: Exit[];
  breaks: Exit[];
  continues: Exit[];
  returns: Exit[];
  left: number;
  right: number;
  bottom: number;
};

const CHAR_W = 7.8; // Geist Mono at 13px: 0.6 em per character
const MAX_CHARS = 28;
const PAD_X = 14;
const MIN_W = 88;
const HEIGHT: Record<NodeShape, number> = { terminal: 34, process: 36, io: 36, decision: 56, loop: 40, jump: 30 };
const SLANT: Record<NodeShape, number> = { terminal: 8, process: 0, io: 16, decision: 48, loop: 24, jump: 0 };
const GAP_Y = 30;
const GAP_X = 36;
const LANE = 22;
const MARGIN = 16;
/** The call label next to a block (render.ts): 6px from the block, Geist Mono at 11px. */
export const CALL_GAP = 6;
const CALL_CHAR_W = 6.6;
/** Characters reserved in a decision for " → tak" when it shows its value. */
export const DECISION_EXTRA = 7;

export function shorten(text: string): string {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}

const top = (n: ChartNode): Point => [n.x, n.y - n.h / 2];
const bottom = (n: ChartNode): Point => [n.x, n.y + n.h / 2];
const right = (n: ChartNode): Point => [n.x + n.w / 2, n.y];
const left = (n: ChartNode): Point => [n.x - n.w / 2, n.y];

/** Drops repeated points and middle points of straight runs. */
function tidy(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    const prev = out.at(-2);
    if (prev && last && ((prev[0] === last[0] && last[0] === p[0]) || (prev[1] === last[1] && last[1] === p[1]))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

function shift(f: Fragment, dx: number): Fragment {
  for (const n of f.nodes) n.x += dx;
  for (const e of f.edges) e.points = e.points.map(([x, y]) => [x + dx, y]);
  for (const exit of [...f.exits, ...f.breaks, ...f.continues, ...f.returns]) if (exit.lane !== undefined) exit.lane += dx;
  f.left += dx;
  f.right += dx;
  return f;
}

class Builder {
  private nodeCount = 0;
  private edgeCount = 0;
  private byId = new Map<string, ChartNode>();
  private key: string;

  constructor(chart: string) {
    this.key = chart;
  }

  node(shape: NodeShape, text: string, line: number | null, topY: number, extra: Partial<ChartNode> = {}): ChartNode {
    const chars = shorten(text).length + (shape === 'decision' ? DECISION_EXTRA : 0);
    const w = Math.max(MIN_W, chars * CHAR_W + 2 * PAD_X + SLANT[shape]);
    const h = HEIGHT[shape];
    const node: ChartNode = { id: `${this.key}#${this.nodeCount++}`, chart: this.key, line, shape, text, x: 0, y: topY + h / 2, w, h, calls: [], ...extra };
    this.byId.set(node.id, node);
    return node;
  }

  get(id: string): ChartNode {
    return this.byId.get(id)!;
  }

  edge(from: string, to: string, points: Point[], label: string, kind: ChartEdge['kind']): ChartEdge {
    return { id: `${this.key}~${this.edgeCount++}`, from, to, points: tidy(points), label, kind };
  }

  /** Joins a pending exit to the top of `to`, going round on the right when the exit has a lane. */
  join(exit: Exit, to: ChartNode): ChartEdge {
    const from = this.get(exit.node);
    const [tx, ty] = top(to);
    const above = ty - GAP_Y / 2;
    let points: Point[];
    if (exit.side === 'right') {
      const [sx, sy] = right(from);
      const lane = exit.lane ?? sx + LANE;
      points = [[sx, sy], [lane, sy], [lane, above], [tx, above], [tx, ty]];
    } else {
      const [sx, sy] = bottom(from);
      points = [[sx, sy], [sx, above], [tx, above], [tx, ty]];
    }
    return this.edge(exit.node, to.id, points, exit.label, exit.kind);
  }

  single(node: ChartNode, exits: Exit[], jumps: Partial<Pick<Fragment, 'breaks' | 'continues' | 'returns'>> = {}): Fragment {
    // room on the right for the "↗ double" call label, so lanes going round pass it by
    const callLabel = node.calls.length ? CALL_GAP + (2 + node.calls.join(', ').length) * CALL_CHAR_W : 0;
    return {
      nodes: [node], edges: [], entry: node.id, exits, breaks: [], continues: [], returns: [], ...jumps,
      left: -node.w / 2, right: node.w / 2 + callLabel, bottom: node.y + node.h / 2,
    };
  }

  sequence(blocks: FlowBlock[], topY: number): Fragment | null {
    let whole: Fragment | null = null;
    let y = topY;
    for (const block of blocks) {
      const next = this.block(block, y);
      if (whole) {
        const entry = this.get(next.entry);
        whole = {
          nodes: [...whole.nodes, ...next.nodes],
          edges: [...whole.edges, ...next.edges, ...whole.exits.map((exit) => this.join(exit, entry))],
          entry: whole.entry,
          exits: next.exits,
          breaks: [...whole.breaks, ...next.breaks],
          continues: [...whole.continues, ...next.continues],
          returns: [...whole.returns, ...next.returns],
          left: Math.min(whole.left, next.left),
          right: Math.max(whole.right, next.right),
          bottom: next.bottom,
        };
      } else whole = next;
      y = whole.bottom + GAP_Y;
    }
    return whole;
  }

  block(b: FlowBlock, topY: number): Fragment {
    switch (b.kind) {
      case 'stmt': {
        const node = this.node(b.io ? 'io' : 'process', b.text, b.line, topY, { calls: b.calls });
        return this.single(node, [{ node: node.id, side: 'bottom', label: '', kind: 'next' }]);
      }
      case 'break':
      case 'continue': {
        const node = this.node('jump', b.kind, b.line, topY);
        const jump: Exit = { node: node.id, side: 'right', label: '', kind: 'jump' };
        return this.single(node, [], b.kind === 'break' ? { breaks: [jump] } : { continues: [jump] });
      }
      case 'return': {
        const node = this.node('jump', b.text ? `return ${b.text}` : 'return', b.line, topY, { calls: b.calls });
        return this.single(node, [], { returns: [{ node: node.id, side: 'right', label: '', kind: 'jump' }] });
      }
      case 'while':
      case 'for':
        return this.loop(b, topY);
      case 'if':
        return this.ifElse(b, topY);
    }
  }

  loop(b: Extract<FlowBlock, { kind: 'while' | 'for' }>, topY: number): Fragment {
    const isWhile = b.kind === 'while';
    const check = this.node(isWhile ? 'decision' : 'loop', isWhile ? b.test : `for ${b.target} in ${b.iter}`, b.line, topY, isWhile ? {} : { target: b.target });
    const body = this.sequence(b.body, check.y + check.h / 2 + GAP_Y)!;
    check.inner = body.nodes.map((n) => n.id);
    const backLane = Math.min(body.left, -check.w / 2) - LANE;
    const exitLane = Math.max(body.right, check.w / 2) + LANE;
    const below = body.bottom + GAP_Y / 2;
    const [lx, ly] = left(check);
    const edges = [...body.edges, this.edge(check.id, body.entry, [bottom(check), top(this.get(body.entry))], isWhile ? 'tak' : 'następny', 'yes')];
    body.exits.forEach((exit, i) => {
      const from = this.get(exit.node);
      const start: Point[] = exit.side === 'right'
        ? [right(from), [exit.lane ?? right(from)[0] + LANE, from.y], [exit.lane ?? right(from)[0] + LANE, below]]
        : [bottom(from), [from.x, below]];
      edges.push(this.edge(exit.node, check.id, [...start, [backLane, below], [backLane, ly], [lx, ly]], i === 0 ? 'wróć' : '', 'back'));
    });
    for (const cont of body.continues) {
      const from = this.get(cont.node);
      edges.push(this.edge(cont.node, check.id, [left(from), [backLane, from.y], [backLane, ly], [lx, ly]], '', 'back'));
    }
    return {
      nodes: [check, ...body.nodes],
      edges,
      entry: check.id,
      exits: [
        // while True never stops by itself: the only ways out are the breaks
        ...(isWhile && b.test === 'True' ? [] : [{ node: check.id, side: 'right' as const, label: isWhile ? 'nie' : 'koniec', kind: 'no' as const, lane: exitLane }]),
        ...body.breaks.map((exit) => ({ ...exit, side: 'right' as const, lane: exitLane })),
      ],
      breaks: [],
      continues: [],
      returns: body.returns,
      left: backLane - 4,
      right: exitLane + 4,
      bottom: below,
    };
  }

  ifElse(b: Extract<FlowBlock, { kind: 'if' }>, topY: number): Fragment {
    const nodes: ChartNode[] = [];
    const edges: ChartEdge[] = [];
    const exits: Exit[] = [];
    const breaks: Exit[] = [];
    const continues: Exit[] = [];
    const returns: Exit[] = [];
    const bodyTop = topY + HEIGHT.decision + GAP_Y;
    let previous: ChartNode | null = null;
    let reach = 0;
    let leftmost = 0;
    let lowest = topY + HEIGHT.decision;
    let hasElse = false;
    const take = (body: Fragment) => {
      nodes.push(...body.nodes);
      edges.push(...body.edges);
      exits.push(...body.exits);
      breaks.push(...body.breaks);
      continues.push(...body.continues);
      returns.push(...body.returns);
      lowest = Math.max(lowest, body.bottom);
    };
    for (const branch of b.branches) {
      const body = this.sequence(branch.body, bodyTop)!;
      if (branch.test !== null) {
        const decision = this.node('decision', branch.test, branch.line, topY);
        const ax = previous ? reach + GAP_X + Math.max(decision.w / 2, -body.left) : 0;
        decision.x = ax;
        shift(body, ax);
        nodes.push(decision);
        edges.push(this.edge(decision.id, body.entry, [bottom(decision), top(this.get(body.entry))], 'tak', 'yes'));
        if (previous) edges.push(this.edge(previous.id, decision.id, [right(previous), left(decision)], 'nie', 'no'));
        else leftmost = Math.min(-decision.w / 2, body.left);
        reach = Math.max(ax + decision.w / 2, body.right);
        previous = decision;
      } else {
        const ax = reach + GAP_X - body.left;
        shift(body, ax);
        const entry = this.get(body.entry);
        edges.push(this.edge(previous!.id, entry.id, [right(previous!), [ax, previous!.y], top(entry)], 'nie', 'no'));
        reach = body.right;
        hasElse = true;
      }
      take(body);
    }
    if (!hasElse) {
      exits.push({ node: previous!.id, side: 'right', label: 'nie', kind: 'no', lane: reach + LANE });
      reach += LANE + 4;
    }
    return { nodes, edges, entry: nodes.find((n) => n.shape === 'decision')!.id, exits, breaks, continues, returns, left: leftmost, right: reach, bottom: lowest };
  }

  chart(name: string | null, title: string, blocks: FlowBlock[]): Chart {
    const start = this.node('terminal', title, null, MARGIN);
    const body = this.sequence(blocks, start.y + start.h / 2 + GAP_Y);
    const end = this.node('terminal', name ? 'koniec funkcji' : 'koniec', null, (body?.bottom ?? start.y + start.h / 2) + GAP_Y);
    const nodes = [start, ...(body?.nodes ?? []), end];
    const edges = [...(body?.edges ?? [])];
    let reach = Math.max(body?.right ?? 0, start.w / 2, end.w / 2);
    const leftmost = Math.min(body?.left ?? 0, -start.w / 2, -end.w / 2);
    if (body) {
      edges.push(this.edge(start.id, body.entry, [bottom(start), top(this.get(body.entry))], '', 'next'));
      edges.push(...body.exits.map((exit) => this.join(exit, end)));
      if (body.returns.length) {
        const lane = reach + LANE;
        edges.push(...body.returns.map((exit) => this.join({ ...exit, lane }, end)));
        reach = lane + 4;
      }
    } else edges.push(this.edge(start.id, end.id, [bottom(start), top(end)], '', 'next'));
    const dx = MARGIN - leftmost;
    for (const n of nodes) n.x += dx;
    for (const e of edges) e.points = e.points.map(([x, y]) => [x + dx, y]);
    return { name, title, nodes, edges, width: reach - leftmost + 2 * MARGIN, height: end.y + end.h / 2 + MARGIN };
  }
}

export function layout(program: FlowProgram): Chart[] {
  return [
    new Builder('main').chart(null, 'start', program.main),
    ...Object.entries(program.functions).map(([name, f]) => new Builder(name).chart(name, `def ${name}(${f.params})`, f.body)),
  ];
}
