import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../../src/lib/flowchart/layout.ts';
import { progress } from '../../src/lib/flowchart/progress.ts';
import type { TraceStep } from '../../src/lib/languages/types.ts';
import { countdown, loopsAndJumps, withFunction } from './fixtures.ts';

type Var = { name: string; type: string; value: string };
const step = (line: number | null, more: Partial<TraceStep> = {}): TraceStep =>
  ({ line, variables: [], output: '', error: null, parts: [], frame: null, locals: [], depth: 0, ...more });
const check = (line: number, n: number, ok: boolean) =>
  step(line, { parts: [{ text: '', from: 0, to: 0, before: 'seconds', value: String(n) }, { text: '', from: 0, to: 0, before: `${n} > 0`, value: ok ? 'True' : 'False' }] });

test('countdown: decisions, chosen edges and rounds', () => {
  const charts = layout(countdown);
  const steps = [step(null), step(1), check(2, 2, true), step(3), step(4), check(2, 1, true), step(3), step(4), check(2, 0, false), step(5)];
  const views = progress(charts, steps);
  const id = (line: number) => charts[0].nodes.find((n) => n.line === line)!.id;
  assert.equal(views[0].node, charts[0].nodes[0].id);
  assert.equal(views[2].decision, '2 > 0 → tak');
  assert.equal(charts[0].edges.find((e) => e.id === views[2].edge)!.to, id(3));
  assert.deepEqual(views[2].badges, []);
  assert.deepEqual(views[3].badges, [{ node: id(2), text: 'obrót 1' }]);
  assert.deepEqual(views[6].badges, [{ node: id(2), text: 'obrót 2' }]);
  assert.equal(views[8].decision, '0 > 0 → nie');
  assert.equal(charts[0].edges.find((e) => e.id === views[8].edge)!.to, id(5));
  assert.deepEqual(views[9].badges, []);
  assert.equal(views[3].from, id(2));
});

test('for loop: the badge shows the element', () => {
  const charts = layout(loopsAndJumps);
  const w = (value: string): Var[] => [{ name: 'w', type: 'str', value }];
  const steps = [step(null), step(8, { variables: w("'a'") }), step(9, { variables: w("'a'") }), step(8, { variables: w("'b'") }), step(9, { variables: w("'b'") }), step(8, { variables: w("'b'") })];
  const views = progress(charts, steps);
  const loop = charts[0].nodes.find((n) => n.line === 8)!.id;
  assert.deepEqual(views[1].badges, [{ node: loop, text: "w = 'a'" }]);
  assert.deepEqual(views[4].badges, [{ node: loop, text: "obrót 2 · w = 'b'" }]);
  assert.deepEqual(views[5].badges, [{ node: loop, text: 'obrót 2 · koniec listy' }]);
});

test('a call moves to the function chart without animation', () => {
  const charts = layout(withFunction);
  const steps = [step(null), step(1), step(4), step(2, { frame: 'double', depth: 1 }), step(3, { frame: 'double', depth: 1 }), step(5)];
  const views = progress(charts, steps);
  assert.equal(views[1].node, charts[0].nodes[0].id, 'the def line stays at the start');
  assert.equal(views[3].chart, 'double');
  assert.equal(views[3].from, null);
  assert.equal(views[4].from, views[3].node);
  assert.equal(views[5].chart, 'main');
  assert.equal(views[5].from, null);
});

test('an error marks the step', () => {
  const charts = layout(countdown);
  const error = { type: 'ZeroDivisionError', message: 'x', line: 1, line_text: null, hint: null };
  const views = progress(charts, [step(null), step(1, { error })]);
  assert.equal(views[1].error, true);
  const cut = progress(charts, [step(null), step(1, { error: { ...error, type: 'TooManySteps' } })]);
  assert.equal(cut[1].error, false);
});
