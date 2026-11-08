import type { FlowProgram } from '../../src/lib/flowchart/model.ts';

/** seconds = 2 / while seconds > 0: print, -= 1 / print */
export const countdown: FlowProgram = {
  main: [
    { kind: 'stmt', line: 1, text: 'seconds = 2', io: null, calls: [] },
    { kind: 'while', line: 2, test: 'seconds > 0', body: [
      { kind: 'stmt', line: 3, text: 'print(seconds)', io: 'out', calls: [] },
      { kind: 'stmt', line: 4, text: 'seconds -= 1', io: null, calls: [] },
    ] },
    { kind: 'stmt', line: 5, text: 'print("Szczęśliwego Nowego Roku!")', io: 'out', calls: [] },
  ],
  functions: {},
};

export const ladder: FlowProgram = {
  main: [
    { kind: 'stmt', line: 1, text: 'x = 5', io: null, calls: [] },
    { kind: 'if', line: 2, branches: [
      { line: 2, test: 'x > 3', body: [{ kind: 'stmt', line: 3, text: 'print("a")', io: 'out', calls: [] }] },
      { line: 4, test: 'x > 1', body: [{ kind: 'stmt', line: 5, text: 'print("b")', io: 'out', calls: [] }] },
      { line: 6, test: null, body: [{ kind: 'stmt', line: 7, text: 'print("c")', io: 'out', calls: [] }] },
    ] },
    { kind: 'stmt', line: 8, text: 'print("koniec")', io: 'out', calls: [] },
  ],
  functions: {},
};

export const loopsAndJumps: FlowProgram = {
  main: [
    { kind: 'stmt', line: 1, text: 'n = 0', io: null, calls: [] },
    { kind: 'while', line: 2, test: 'n < 5', body: [
      { kind: 'stmt', line: 3, text: 'n += 1', io: null, calls: [] },
      { kind: 'if', line: 4, branches: [{ line: 4, test: 'n == 2', body: [{ kind: 'continue', line: 5 }] }] },
      { kind: 'if', line: 6, branches: [{ line: 6, test: 'n == 4', body: [{ kind: 'break', line: 7 }] }] },
    ] },
    { kind: 'for', line: 8, target: 'w', iter: "['a', 'b']", body: [{ kind: 'stmt', line: 9, text: 'print(w)', io: 'out', calls: [] }] },
  ],
  functions: {},
};

export const withFunction: FlowProgram = {
  main: [
    { kind: 'stmt', line: 4, text: 'y = double(3)', io: null, calls: ['double'] },
    { kind: 'stmt', line: 5, text: 'print(y)', io: 'out', calls: [] },
  ],
  functions: {
    double: { line: 1, params: 'n', body: [
      { kind: 'stmt', line: 2, text: 'r = n * 2', io: null, calls: [] },
      { kind: 'return', line: 3, text: 'r', calls: [] },
    ] },
  },
};

export function linesOf(blocks: FlowProgram['main']): number[] {
  return blocks.flatMap((b) => {
    if (b.kind === 'if') return b.branches.flatMap((br) => [...(br.test === null ? [] : [br.line]), ...linesOf(br.body)]);
    if (b.kind === 'while' || b.kind === 'for') return [b.line, ...linesOf(b.body)];
    return [b.line];
  });
}
