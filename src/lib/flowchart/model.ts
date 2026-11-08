// Shapes of the flowchart data: blocks from checker.flowchart() and the laid-out chart.

export type FlowStmt = { kind: 'stmt'; line: number; text: string; io: 'in' | 'out' | null; calls: string[] };
export type FlowBranch = { line: number; test: string | null; body: FlowBlock[] };
export type FlowIf = { kind: 'if'; line: number; branches: FlowBranch[] };
export type FlowWhile = { kind: 'while'; line: number; test: string; body: FlowBlock[] };
export type FlowFor = { kind: 'for'; line: number; target: string; iter: string; body: FlowBlock[] };
export type FlowJump = { kind: 'break' | 'continue'; line: number };
export type FlowReturn = { kind: 'return'; line: number; text: string; calls: string[] };
export type FlowBlock = FlowStmt | FlowIf | FlowWhile | FlowFor | FlowJump | FlowReturn;
export type FlowFunction = { line: number; params: string; body: FlowBlock[] };
export type FlowProgram = { main: FlowBlock[]; functions: Record<string, FlowFunction> };

export type NodeShape = 'terminal' | 'process' | 'io' | 'decision' | 'loop' | 'jump';

/** A block on the chart; (x, y) is its centre. */
export type ChartNode = {
  id: string;
  /** 'main' or the function's name. */
  chart: string;
  line: number | null;
  shape: NodeShape;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  calls: string[];
  /** Loops: the ids of every node inside the loop body. */
  inner?: string[];
  /** for loops: the loop variable. */
  target?: string;
};

export type ChartEdge = {
  id: string;
  from: string;
  to: string;
  points: [number, number][];
  label: string;
  kind: 'yes' | 'no' | 'next' | 'back' | 'jump';
};

export type Chart = { name: string | null; title: string; nodes: ChartNode[]; edges: ChartEdge[]; width: number; height: number };
