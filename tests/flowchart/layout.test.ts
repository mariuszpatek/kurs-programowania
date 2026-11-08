import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../../src/lib/flowchart/layout.ts';
import type { Chart, ChartNode } from '../../src/lib/flowchart/model.ts';
import { countdown, ladder, linesOf, loopsAndJumps, withFunction } from './fixtures.ts';

const box = (n: ChartNode) => ({ l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - n.h / 2, b: n.y + n.h / 2 });

function checkChart(chart: Chart) {
  const ids = new Set(chart.nodes.map((n) => n.id));
  for (const [i, a] of chart.nodes.entries()) {
    for (const b of chart.nodes.slice(i + 1)) {
      const p = box(a), q = box(b);
      const overlap = p.l < q.r - 1 && q.l < p.r - 1 && p.t < q.b - 1 && q.t < p.b - 1;
      assert.ok(!overlap, `${a.text} overlaps ${b.text}`);
    }
  }
  for (const e of chart.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to), `edge ${e.id} joins unknown nodes`);
    assert.ok(e.points.length >= 2, `edge ${e.id} has no path`);
    for (const [x, y] of e.points) assert.ok(x >= 0 && x <= chart.width && y >= 0 && y <= chart.height, `edge ${e.id} leaves the chart`);
    const [fx, fy] = e.points[0];
    const from = box(chart.nodes.find((n) => n.id === e.from)!);
    assert.ok(fx >= from.l - 1 && fx <= from.r + 1 && fy >= from.t - 1 && fy <= from.b + 1, `edge ${e.id} does not start at its node`);
    const [tx, ty] = e.points.at(-1)!;
    const to = box(chart.nodes.find((n) => n.id === e.to)!);
    assert.ok(tx >= to.l - 1 && tx <= to.r + 1 && ty >= to.t - 1 && ty <= to.b + 1, `edge ${e.id} does not end at its node`);
  }
}

test('every program gives valid charts', () => {
  for (const program of [countdown, ladder, loopsAndJumps, withFunction]) layout(program).forEach(checkChart);
});

test('every line of the program has a node', () => {
  for (const program of [countdown, ladder, loopsAndJumps]) {
    const lines = new Set(layout(program)[0].nodes.map((n) => n.line));
    for (const line of linesOf(program.main)) assert.ok(lines.has(line), `no node for line ${line}`);
  }
});

test('a while loop: decision, body inside it, a way back and a way out', () => {
  const [chart] = layout(countdown);
  const loop = chart.nodes.find((n) => n.line === 2)!;
  assert.equal(loop.shape, 'decision');
  const body = chart.nodes.filter((n) => n.line === 3 || n.line === 4).map((n) => n.id);
  assert.deepEqual(loop.inner, body);
  const after = chart.nodes.find((n) => n.line === 5)!;
  assert.ok(chart.edges.some((e) => e.kind === 'back' && e.to === loop.id && e.label === 'wróć'));
  assert.ok(chart.edges.some((e) => e.from === loop.id && e.to === after.id && e.label === 'nie'));
  assert.ok(chart.edges.some((e) => e.from === loop.id && e.to === body[0] && e.label === 'tak'));
  assert.equal(chart.nodes.filter((n) => n.shape === 'terminal').length, 2);
});

test('elif is a ladder: decisions side by side, every branch reaches the next line', () => {
  const [chart] = layout(ladder);
  const [first, second] = chart.nodes.filter((n) => n.shape === 'decision');
  assert.equal(first.y, second.y);
  assert.ok(second.x > first.x);
  const after = chart.nodes.find((n) => n.line === 8)!;
  for (const line of [3, 5, 7]) {
    const branch = chart.nodes.find((n) => n.line === line)!;
    assert.ok(chart.edges.some((e) => e.from === branch.id && e.to === after.id), `line ${line} does not lead on`);
  }
});

test('break leaves the loop, continue goes back to its check', () => {
  const [chart] = layout(loopsAndJumps);
  const loop = chart.nodes.find((n) => n.line === 2)!;
  const brk = chart.nodes.find((n) => n.line === 7)!;
  const cont = chart.nodes.find((n) => n.line === 5)!;
  const forLoop = chart.nodes.find((n) => n.line === 8)!;
  assert.ok(chart.edges.some((e) => e.from === cont.id && e.to === loop.id));
  assert.ok(chart.edges.some((e) => e.from === brk.id && e.to === forLoop.id));
  assert.equal(forLoop.shape, 'loop');
  assert.equal(forLoop.target, 'w');
});

test('while True has no way out except break', () => {
  const [chart] = layout({ main: [
    { kind: 'while', line: 1, test: 'True', body: [{ kind: 'break', line: 2 }] },
    { kind: 'stmt', line: 3, text: 'print("koniec")', io: 'out', calls: [] },
  ], functions: {} });
  const loop = chart.nodes.find((n) => n.line === 1)!;
  const brk = chart.nodes.find((n) => n.line === 2)!;
  const after = chart.nodes.find((n) => n.line === 3)!;
  assert.ok(!chart.edges.some((e) => e.from === loop.id && e.label === 'nie'));
  assert.ok(chart.edges.some((e) => e.from === brk.id && e.to === after.id));
});

test('the way out of a loop passes the call label by', () => {
  const [chart] = layout({ main: [
    { kind: 'for', line: 1, target: 'w', iter: '[1, 2]', body: [{ kind: 'stmt', line: 2, text: 'y = double(w)', io: null, calls: ['double'] }] },
  ], functions: {} });
  const call = chart.nodes.find((n) => n.line === 2)!;
  const labelEnd = call.x + call.w / 2 + 6 + '↗ double'.length * 6.6;
  const out = chart.edges.find((e) => e.label === 'koniec')!;
  assert.ok(Math.max(...out.points.map(([x]) => x)) > labelEnd);
});

test('functions get their own chart', () => {
  const charts = layout(withFunction);
  assert.deepEqual(charts.map((c) => c.name), [null, 'double']);
  assert.equal(charts[1].title, 'def double(n)');
  assert.ok(charts[1].nodes.every((n) => n.chart === 'double'));
  assert.deepEqual(charts[0].nodes.find((n) => n.line === 4)!.calls, ['double']);
  const ret = charts[1].nodes.find((n) => n.line === 3)!;
  assert.equal(ret.shape, 'jump');
  assert.ok(charts[1].edges.some((e) => e.from === ret.id));
});

test('deeper nesting makes a bigger chart', () => {
  const flat = layout({ main: [{ kind: 'stmt', line: 1, text: 'a = 1', io: null, calls: [] }], functions: {} })[0];
  const [loop] = layout(countdown);
  assert.ok(loop.height > flat.height);
  assert.ok(layout(ladder)[0].width > loop.width);
});
