# Schematy blokowe w „Krok po kroku”: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przy każdym przykładzie ```` ```python krok ```` przełącznik Kod / Schemat: schemat blokowy rysowany automatycznie z kodu i animowany według `checker.trace`.

**Architecture:** `checker.py` dokłada do wyniku `trace` drzewo bloków (`flow`) i ramki funkcji w krokach. W TypeScripcie `layout.ts` liczy pozycje (czyste funkcje), `progress.ts` zamienia kroki na stan schematu, `render.ts` rysuje SVG i podświetla bieżący krok, a `stepper.ts` dodaje przełącznik. Na start przełącznik widzi tylko nauczyciel (flaga na `<html>`), żeby wdrożyć „jako szkic”.

**Tech Stack:** Python 3 (`ast`, `sys.settrace`) w Pyodide, TypeScript + Astro, SVG, `unittest`, `node --test --experimental-strip-types` (Node 22).

**Spec:** `docs/superpowers/specs/2026-11-08-schematy-blokowe-design.md`

## Global Constraints

- Bez nowych zależności npm.
- Kod, nazwy, komentarze po angielsku; teksty dla ucznia po polsku („tak”, „nie”, „wróć”, „obrót 2”).
- SVG tylko z klasami w CSS (zmienne `--accent`, `--line-strong`, `--surface-2`, `--bad`…), bez kolorów w atrybutach; działa w jasnym i ciemnym motywie.
- `flow` = `null` przy: `try`, `with`, `class`, `match`, `async`, `global`/`nonlocal`, funkcji w funkcji, dekoratorach, `else` przy `while`/`for`, ponad 40 blokach.
- Istniejący widok kodu i jego pola (`line`, `variables`, `output`, `error`, `parts`) bez zmian.
- `prefers-reduced-motion`: bez animacji kropki.
- `localStorage` zawsze w try/catch.
- Przełącznik widoczny tylko, gdy `document.documentElement.dataset.flowchart === 'on'` (na start: tylko nauczyciel).

---

### Task 1: `flow` i ramki funkcji w `checker.py`

**Files:**
- Modify: `public/py/checker.py` (nowa funkcja `flowchart`, zmiany w `trace`)
- Test: `tests/test_checker.py`

**Interfaces:**
- Produces: `checker.flowchart(code: str) -> dict | None`; `checker.trace(...)` zwraca dodatkowo `"flow"`, a każdy krok `"frame": str | None`, `"locals": list`, `"depth": int`.

- [ ] **Step 1: Testy**

Dopisz do `tests/test_checker.py` przed `if __name__ == "__main__":`:

```python
class Flowchart(unittest.TestCase):
    def test_sequence_and_io(self):
        flow = checker.flowchart('a = input("? ")\nprint(a)\n')
        self.assertEqual(flow["main"], [
            {"kind": "stmt", "line": 1, "text": 'a = input("? ")', "io": "in", "calls": []},
            {"kind": "stmt", "line": 2, "text": "print(a)", "io": "out", "calls": []},
        ])
        self.assertEqual(flow["functions"], {})

    def test_if_elif_else(self):
        code = 'x = 5\nif x > 3:\n    print("a")\nelif x > 1:\n    print("b")\nelse:\n    print("c")\n'
        branches = checker.flowchart(code)["main"][1]["branches"]
        self.assertEqual([b["test"] for b in branches], ["x > 3", "x > 1", None])
        self.assertEqual([b["line"] for b in branches], [2, 4, 6])
        self.assertEqual(branches[2]["body"][0]["line"], 7)

    def test_else_with_if_inside_is_not_elif(self):
        code = "x = 1\nif x:\n    pass\nelse:\n    if x:\n        pass\n"
        branches = checker.flowchart(code)["main"][1]["branches"]
        self.assertEqual([b["test"] for b in branches], ["x", None])
        self.assertEqual(branches[1]["body"][0]["kind"], "if")

    def test_loops_and_jumps(self):
        code = "n = 0\nwhile n < 5:\n    n += 1\n    if n == 2:\n        continue\n    if n == 4:\n        break\nfor w in ['a', 'b']:\n    print(w)\n"
        main = checker.flowchart(code)["main"]
        self.assertEqual(main[1]["kind"], "while")
        self.assertEqual(main[1]["test"], "n < 5")
        self.assertEqual(main[1]["body"][1]["branches"][0]["body"], [{"kind": "continue", "line": 5}])
        self.assertEqual(main[1]["body"][2]["branches"][0]["body"], [{"kind": "break", "line": 7}])
        self.assertEqual((main[2]["kind"], main[2]["target"], main[2]["iter"]), ("for", "w", "['a', 'b']"))

    def test_functions(self):
        code = "def double(n):\n    return n * 2\ny = double(3)\n"
        flow = checker.flowchart(code)
        self.assertEqual(flow["functions"], {"double": {"line": 1, "params": "n", "body": [
            {"kind": "return", "line": 2, "text": "n * 2", "calls": []}]}})
        self.assertEqual(flow["main"], [{"kind": "stmt", "line": 3, "text": "y = double(3)", "io": None, "calls": ["double"]}])

    def test_two_statements_on_one_line_are_one_block(self):
        self.assertEqual(len(checker.flowchart("a = 1; b = 2\n")["main"]), 1)

    def test_what_cannot_be_drawn(self):
        for code in ("try:\n    x = 1\nexcept Exception:\n    pass\n",
                     "while False:\n    pass\nelse:\n    pass\n",
                     "def f():\n    def g():\n        pass\n",
                     "class A:\n    pass\n",
                     "\n".join(f"a{i} = {i}" for i in range(41)) + "\n",
                     'print("a)\n'):
            self.assertIsNone(checker.flowchart(code), code)

    def test_trace_has_flow(self):
        self.assertEqual(checker.trace("a = 1\n")["flow"]["main"][0]["text"], "a = 1")

    def test_steps_know_the_function(self):
        code = "def double(n):\n    r = n * 2\n    return r\ny = double(3)\nprint(y)\n"
        steps = checker.trace(code)["steps"]
        inside = [s for s in steps if s["frame"] == "double"]
        self.assertEqual([s["line"] for s in inside], [2, 3])
        self.assertEqual(inside[0]["locals"], [{"name": "n", "type": "int", "value": "3"}, {"name": "r", "type": "int", "value": "6"}])
        self.assertEqual(inside[0]["depth"], 1)
        outside = [s for s in steps if s["frame"] is None]
        self.assertTrue(all(s["locals"] == [] and s["depth"] == 0 for s in outside))
        self.assertEqual(steps[-1]["line"], 5)
```

- [ ] **Step 2: Uruchom, mają nie przejść**

Run: `py -m unittest tests.test_checker -v`
Expected: FAIL, `AttributeError: module 'checker' has no attribute 'flowchart'`.

- [ ] **Step 3: `flowchart` w `checker.py`**

Wstaw przed `def trace(` (po `MAX_STEPS`/`TooManySteps`):

```python
FLOW_MAX_BLOCKS = 40
_SIMPLE_STATEMENTS = (ast.Expr, ast.Assign, ast.AugAssign, ast.AnnAssign, ast.Pass, ast.Import, ast.ImportFrom, ast.Assert, ast.Delete)


class _NoFlowchart(Exception):
    """The program uses something the flowchart cannot draw yet."""


def flowchart(code):
    """The program as nested blocks for the flowchart in "Krok po kroku", or None when it cannot be
    drawn (try, with, class, match, nested def, decorators, else after a loop, too many blocks).

    Blocks: stmt (line, text, io: "in"/"out"/None, calls), if (branches: line, test or None for else,
    body), while (test, body), for (target, iter, body), break, continue, return (text, calls).
    `calls` lists the student's own functions called on that line."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    lines = code.splitlines()
    names = {s.name for s in tree.body if isinstance(s, ast.FunctionDef) and not s.decorator_list}
    count = [0]

    def text(node):
        return ast.get_source_segment(code, node) or ""

    def calls(node):
        found = []
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name) and sub.func.id in names and sub.func.id not in found:
                found.append(sub.func.id)
        return found

    def else_line(orelse):
        n = orelse[0].lineno
        while n > 1 and not lines[n - 1].strip().startswith("else"):
            n -= 1
        return n

    def body(statements):
        out = []
        for statement in statements:
            item = block(statement)
            last = out[-1] if out else None
            if item["kind"] == "stmt" and last and last["kind"] == "stmt" and last["line"] == item["line"]:
                last["calls"] += [c for c in item["calls"] if c not in last["calls"]]
                count[0] -= 1
                continue
            out.append(item)
        return out

    def block(statement):
        count[0] += 1
        if count[0] > FLOW_MAX_BLOCKS:
            raise _NoFlowchart()
        line = statement.lineno
        if isinstance(statement, _SIMPLE_STATEMENTS):
            source = lines[line - 1].strip()
            io = "in" if "input(" in source else "out" if source.startswith("print(") else None
            return {"kind": "stmt", "line": line, "text": source, "io": io, "calls": calls(statement)}
        if isinstance(statement, ast.If):
            branches, node = [], statement
            while True:
                branches.append({"line": node.lineno, "test": text(node.test), "body": body(node.body)})
                orelse = node.orelse
                if len(orelse) == 1 and isinstance(orelse[0], ast.If) and lines[orelse[0].lineno - 1].strip().startswith("elif"):
                    node = orelse[0]
                    continue
                if orelse:
                    branches.append({"line": else_line(orelse), "test": None, "body": body(orelse)})
                return {"kind": "if", "line": line, "branches": branches}
        if isinstance(statement, (ast.While, ast.For)) and statement.orelse:
            raise _NoFlowchart()
        if isinstance(statement, ast.While):
            return {"kind": "while", "line": line, "test": text(statement.test), "body": body(statement.body)}
        if isinstance(statement, ast.For):
            return {"kind": "for", "line": line, "target": text(statement.target), "iter": text(statement.iter), "body": body(statement.body)}
        if isinstance(statement, ast.Break):
            return {"kind": "break", "line": line}
        if isinstance(statement, ast.Continue):
            return {"kind": "continue", "line": line}
        if isinstance(statement, ast.Return):
            return {"kind": "return", "line": line, "text": text(statement.value) if statement.value else "", "calls": calls(statement)}
        raise _NoFlowchart()

    try:
        functions = {}
        for statement in tree.body:
            if isinstance(statement, ast.FunctionDef) and statement.name in names:
                count[0] += 1
                functions[statement.name] = {"line": statement.lineno, "params": ast.unparse(statement.args), "body": body(statement.body)}
        main = body([s for s in tree.body if not (isinstance(s, ast.FunctionDef) and s.name in names)])
        return {"main": main, "functions": functions}
    except _NoFlowchart:
        return None
```

- [ ] **Step 4: ramki funkcji w `trace`**

W `trace` zamień `previous = [None]` na:

```python
    previous = [None, None, 0]  # the line just executed, its frame and its call depth (0: the program)
```

W `snapshot` zamień `line = previous[0]` na:

```python
        line, frame, depth = previous
```

i `steps.append({...})` na:

```python
        function = frame.f_code.co_name if frame is not None and depth > 0 else None
        steps.append({
            "line": line, "variables": _describe_variables(namespace), "output": out.getvalue(), "error": error, "parts": parts,
            "frame": function, "locals": _describe_variables(frame.f_locals) if function else [], "depth": depth,
        })
```

Nad `def on_line` dodaj:

```python
    def depth_of(frame):
        depth = -1
        while frame is not None:
            if frame.f_code.co_filename == STUDENT_FILE:
                depth += 1
            frame = frame.f_back
        return depth
```

a w `on_line` zamień `previous[0] = frame.f_lineno` na:

```python
            previous[:] = [frame.f_lineno, frame, depth_of(frame)]
```

Na końcu `trace` zamień oba `return` tak, żeby zawierały `flow`:

```python
        return {"steps": [], "error": _describe_error(exc, code), "flow": None}
    ...
    return {"steps": steps, "error": steps[-1]["error"] if steps else None, "flow": flowchart(code)}
```

Uzupełnij docstring `trace`: „frame / locals / depth: the function the line belongs to (None for the program), its variables and how deep the call is; flow: see flowchart()”.

- [ ] **Step 5: Testy przechodzą**

Run: `py -m unittest discover tests -v`
Expected: wszystkie OK (także stare testy `Trace`).

- [ ] **Step 6: Commit**

```bash
git add public/py/checker.py tests/test_checker.py
git commit -m "Trace: flowchart blocks and the function each step is in"
```

---

### Task 2: model i układ schematu (`model.ts`, `layout.ts`)

**Files:**
- Create: `src/lib/flowchart/model.ts`, `src/lib/flowchart/layout.ts`
- Test: `tests/flowchart/layout.test.ts`, `tests/flowchart/fixtures.ts`
- Modify: `package.json` (`test`)

**Interfaces:**
- Produces:
  - typy `FlowBlock`, `FlowProgram`, `ChartNode`, `ChartEdge`, `Chart`, `NodeShape` (poniżej),
  - `layout(program: FlowProgram): Chart[]` (pierwszy to program, `name: null`, `chart: 'main'`; potem funkcje),
  - `shorten(text: string): string`, `DECISION_EXTRA: number`.

- [ ] **Step 1: `model.ts`**

```ts
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
```

- [ ] **Step 2: Dane testowe `tests/flowchart/fixtures.ts`**

```ts
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
```

- [ ] **Step 3: Testy `tests/flowchart/layout.test.ts`**

```ts
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
```

W `package.json` zmień `"test"` na:

```json
"test": "py -m unittest discover tests && node --test --experimental-strip-types \"tests/flowchart/*.test.ts\""
```

- [ ] **Step 4: Uruchom, ma nie przejść**

Run: `node --test --experimental-strip-types "tests/flowchart/*.test.ts"`
Expected: FAIL, nie ma modułu `layout.ts`.

- [ ] **Step 5: `layout.ts`**

```ts
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

  constructor(private chart: string) {}

  node(shape: NodeShape, text: string, line: number | null, topY: number, extra: Partial<ChartNode> = {}): ChartNode {
    const chars = shorten(text).length + (shape === 'decision' ? DECISION_EXTRA : 0);
    const w = Math.max(MIN_W, chars * CHAR_W + 2 * PAD_X + SLANT[shape]);
    const h = HEIGHT[shape];
    const node: ChartNode = { id: `${this.chart}#${this.nodeCount++}`, chart: this.chart, line, shape, text, x: 0, y: topY + h / 2, w, h, calls: [], ...extra };
    this.byId.set(node.id, node);
    return node;
  }

  get(id: string): ChartNode {
    return this.byId.get(id)!;
  }

  edge(from: string, to: string, points: Point[], label: string, kind: ChartEdge['kind']): ChartEdge {
    return { id: `${this.chart}~${this.edgeCount++}`, from, to, points: tidy(points), label, kind };
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
    return {
      nodes: [node], edges: [], entry: node.id, exits, breaks: [], continues: [], returns: [], ...jumps,
      left: -node.w / 2, right: node.w / 2, bottom: node.y + node.h / 2,
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
        { node: check.id, side: 'right', label: isWhile ? 'nie' : 'koniec', kind: 'no', lane: exitLane },
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
    let leftmost = Math.min(body?.left ?? 0, -start.w / 2, -end.w / 2);
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
```

- [ ] **Step 6: Testy przechodzą**

Run: `node --test --experimental-strip-types "tests/flowchart/*.test.ts"`
Expected: wszystkie `ok`. Jeśli test nakładania albo granic nie przejdzie, popraw stałe/odstępy w `layout.ts`, nie test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/flowchart/model.ts src/lib/flowchart/layout.ts tests/flowchart package.json
git commit -m "Flowchart layout from the program's blocks"
```

---

### Task 3: przebieg po schemacie (`progress.ts`)

**Files:**
- Create: `src/lib/flowchart/progress.ts`
- Modify: `src/lib/languages/types.ts` (pola kroku i `flow`)
- Test: `tests/flowchart/progress.test.ts`

**Interfaces:**
- Consumes: `layout`, `Chart`, `ChartNode` z Task 2; `TraceStep` z `types.ts`.
- Produces: `progress(charts: Chart[], steps: TraceStep[]): StepView[]`, typ `StepView`:

```ts
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
```

- [ ] **Step 1: Pola w `types.ts`**

W `TraceStep` dopisz:

```ts
  /** The student's function this line belongs to (null: the program), its variables and the call depth. */
  frame?: string | null;
  locals?: { name: string; type: string; value: string }[];
  depth?: number;
```

a `TraceResult` zmień na:

```ts
export type TraceResult = { steps: TraceStep[]; error: CodeError | null; flow?: FlowProgram | null };
```

z `import type { FlowProgram } from '../flowchart/model';` na górze.

- [ ] **Step 2: Testy `tests/flowchart/progress.test.ts`**

```ts
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
```

- [ ] **Step 3: Uruchom, ma nie przejść**

Run: `node --test --experimental-strip-types "tests/flowchart/*.test.ts"`
Expected: FAIL, nie ma `progress.ts`.

- [ ] **Step 4: `progress.ts`**

```ts
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
```

- [ ] **Step 5: Testy przechodzą**

Run: `npm test`
Expected: Python i Node: wszystkie OK.

- [ ] **Step 6: Commit**

```bash
git add src/lib/flowchart/progress.ts src/lib/languages/types.ts tests/flowchart/progress.test.ts
git commit -m "Flowchart progress: node, chosen edge, decision value and loop rounds per step"
```

---

### Task 4: rysowanie (`render.ts`) i wygląd

**Files:**
- Create: `src/lib/flowchart/render.ts`
- Modify: `src/styles/lesson-widgets.css` (sekcja `/* flowchart */` na końcu)

**Interfaces:**
- Consumes: `Chart`, `ChartNode`, `ChartEdge` (Task 2), `shorten`, `StepView` (Task 3).
- Produces: `mountFlowchart(charts: Chart[], views: StepView[]): { element: HTMLElement; show(i: number, animate: boolean): void }`.

- [ ] **Step 1: `render.ts`**

```ts
// Draws the laid-out charts as SVG (classes only, so light and dark themes work) and shows one step:
// the current node, the edge taken next, a decision's value, loop badges and a marker that moves
// along the edge it came by.
import { shorten } from './layout';
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
  if (n.calls.length) g.append(svg('text', { class: 'fc-call', x: n.x + n.w / 2 - 4, y: n.y - n.h / 2 - 4, 'text-anchor': 'end' }, `↗ ${n.calls.join(', ')}`));
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
    const x = target.x + target.w / 2 - w + 10;
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
```

- [ ] **Step 2: Style na końcu `src/styles/lesson-widgets.css`**

```css
/* ---------- flowchart in "Krok po kroku" (src/lib/flowchart) ---------- */

.stepper-views {
  display: inline-flex;
  gap: 2px;
  margin-bottom: 12px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
}

.stepper-views button {
  padding: 4px 14px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--text-2);
  font-size: 13.5px;
  cursor: pointer;
}

.stepper-views button[aria-pressed='true'] {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.stepper-flow {
  min-width: 0;
}

.flowchart {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.flowchart-chart {
  margin: 0;
  max-width: 100%;
  overflow-x: auto;
}

.flowchart-chart figcaption {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-3);
}

.flowchart svg {
  display: block;
  max-width: 100%;
  height: auto;
  overflow: visible;
}

.flowchart .fc-node > rect,
.flowchart .fc-node > polygon {
  fill: var(--surface-2);
  stroke: var(--line-strong);
  stroke-width: 1.5;
  transition: fill 0.2s, stroke 0.2s;
}

.flowchart .fc-terminal > rect {
  fill: var(--surface);
}

.flowchart .fc-text {
  fill: var(--text);
  font-family: var(--mono);
  font-size: 13px;
}

.flowchart .fc-terminal .fc-text {
  font-family: var(--sans);
  fill: var(--text-2);
}

.flowchart .fc-current > rect,
.flowchart .fc-current > polygon {
  fill: var(--accent-bg);
  stroke: var(--accent);
  stroke-width: 2;
}

.flowchart .fc-error > rect,
.flowchart .fc-error > polygon {
  fill: var(--bad-bg);
  stroke: var(--bad);
}

.flowchart .fc-call {
  fill: var(--accent);
  font-family: var(--mono);
  font-size: 11px;
}

.flowchart .fc-edge polyline {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 1.5;
}

.flowchart .fc-head {
  fill: var(--line-strong);
}

.flowchart .fc-label {
  fill: var(--text-3);
  font-size: 12px;
}

.flowchart .fc-chosen polyline {
  stroke: var(--accent);
  stroke-width: 2.5;
}

.flowchart .fc-chosen .fc-head,
.flowchart .fc-chosen .fc-label {
  fill: var(--accent);
}

.flowchart .fc-badge rect {
  fill: var(--accent);
}

.flowchart .fc-badge text {
  fill: var(--surface);
  font-family: var(--mono);
  font-size: 11px;
}

.flowchart .fc-dot {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 2;
}

.stepper-group {
  margin: 8px 0 4px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-3);
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: „Complete!”, bez błędów TypeScriptu.

- [ ] **Step 4: Commit**

```bash
git add src/lib/flowchart/render.ts src/styles/lesson-widgets.css
git commit -m "Flowchart drawing: shapes, edges, current step, badges and the moving marker"
```

---

### Task 5: przełącznik Kod / Schemat w „Krok po kroku” i flaga nauczyciela

**Files:**
- Modify: `src/lib/stepper.ts`, `src/pages/lesson.astro`, `README.md` (sekcja „Krok po kroku”)

**Interfaces:**
- Consumes: `layout` (Task 2), `progress` (Task 3), `mountFlowchart` (Task 4), `TraceResult.flow`, `TraceStep.frame/locals` (Task 3).

- [ ] **Step 1: `stepper.ts`**

1. Pod `DETAILED_KEY` dodaj:

```ts
const VIEW_KEY = 'kurs:stepper-view';

/** Teachers see the flowchart first; students once lesson.astro sets data-flowchart="on" for everyone. */
const flowchartAllowed = () => document.documentElement.dataset.flowchart === 'on';

function loadView(): 'code' | 'flow' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'flow' ? 'flow' : 'code';
  } catch {
    return 'code';
  }
}

function saveView(view: 'code' | 'flow') {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // private mode: the choice is simply not remembered
  }
}
```

2. `variablesView` zamień na wersję z grupą zmiennych funkcji:

```ts
type Var = { name: string; type: string; value: string };

function varRows(vars: Var[], old: Var[] | undefined): HTMLElement[] {
  const before = new Map((old ?? []).map((v) => [v.name, v.value]));
  return vars.map((v) => {
    const kind = !before.has(v.name) ? 'new' : before.get(v.name) !== v.value ? 'changed' : '';
    const row = el('div', `stepper-var type-${['str', 'int', 'float', 'bool'].includes(v.type) ? v.type : 'other'} ${old ? kind : ''}`);
    row.dataset.name = v.name;
    row.append(el('span', 'var-name', v.name), el('span', 'var-value', v.value), el('span', 'var-type', v.type));
    return row;
  });
}

function variablesView(current: TraceStep, previous: TraceStep | undefined): HTMLElement[] {
  const program = varRows(current.variables, previous?.variables);
  if (current.frame) {
    const sameCall = previous?.frame === current.frame && previous?.depth === current.depth;
    return [
      el('p', 'stepper-group', `w funkcji ${current.frame}`),
      ...varRows(current.locals ?? [], sameCall ? previous?.locals : []),
      el('p', 'stepper-group', 'w programie'),
      ...(program.length ? program : [el('p', 'stepper-empty', 'Brak zmiennych.')]),
    ];
  }
  return program.length ? program : [el('p', 'stepper-empty', 'Jeszcze nie ma żadnych zmiennych.')];
}
```

(Przy pierwszym kroku w wywołaniu `[]` jako poprzednie zmienne oznacza, że wszystkie zmienne funkcji są „nowe”.)

3. W `lineCaption` zamień `const parts = [\`Python wykonał linijkę ${step.line}.\`];` na:

```ts
  const parts = [`Python wykonał linijkę ${step.line}${step.frame ? ` w funkcji ${code(step.frame)}` : ''}.`];
```

4. W `mountStepper` po utworzeniu `body` (`body.append(codeList, state);`) dodaj:

```ts
  const flowHost = el('div', 'stepper-flow');
  flowHost.hidden = true;
  body.insertBefore(flowHost, state);
  const views = el('div', 'stepper-views');
  views.hidden = true;
  const codeButton = el('button', '', 'Kod');
  const flowButton = el('button', '', 'Schemat');
  for (const b of [codeButton, flowButton]) b.type = 'button';
  views.append(codeButton, flowButton);
  let chart: { element: HTMLElement; show(i: number, animate: boolean): void } | null = null;
  let flow: FlowProgram | null = null;
```

i zmień `root.append(body, text, controls.element);` na `root.append(views, body, text, controls.element);`.

5. Funkcja przełączania (w `mountStepper`, przed `render`):

```ts
  async function setView(view: 'code' | 'flow') {
    if (view === 'flow' && !chart && flow) {
      const [{ layout }, { progress }, { mountFlowchart }] = await Promise.all([
        import('./flowchart/layout'),
        import('./flowchart/progress'),
        import('./flowchart/render'),
      ]);
      const charts = layout(flow);
      chart = mountFlowchart(charts, progress(charts, steps));
      flowHost.append(chart.element);
    }
    const onFlow = view === 'flow' && Boolean(chart);
    codeList.hidden = onFlow;
    flowHost.hidden = !onFlow;
    body.classList.toggle('on-flow', onFlow);
    codeButton.setAttribute('aria-pressed', String(!onFlow));
    flowButton.setAttribute('aria-pressed', String(onFlow));
    saveView(view);
    if (onFlow && positions.length) chart!.show(positions[at].step, false);
  }
  codeButton.addEventListener('click', () => setView('code'));
  flowButton.addEventListener('click', () => setView('flow'));
```

6. Na końcu `render(forward)` (przed `controls.update(...)`) dodaj:

```ts
    if (chart && !flowHost.hidden) chart.show(i, forward && part === null);
```

7. W `.then((result) => { ... })` po `go(0);` dodaj:

```ts
      flow = result.flow ?? null;
      if (flow && flowchartAllowed()) {
        views.hidden = false;
        void setView(loadView());
      }
```

8. Import typu na górze: `import type { FlowProgram } from './flowchart/model';`.

- [ ] **Step 2: CSS dla układu w trybie schematu**

Dopisz do sekcji flowchart w `lesson-widgets.css`:

```css
.stepper-body.on-flow {
  grid-template-columns: minmax(0, 1.7fr) minmax(200px, 1fr);
}

@media (max-width: 720px) {
  .stepper-body.on-flow {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 3: Flaga w `lesson.astro`**

Na początku skryptu strony (obok importów) dodaj stałą:

```ts
  // "Schemat" in "Krok po kroku": only the teacher sees it until it is switched on for everyone
  const FLOWCHARTS_FOR_STUDENTS = false;
```

i przed `$('lesson-body').innerHTML = renderMarkdown(lesson.body_md);`:

```ts
    if (access.isTeacher || FLOWCHARTS_FOR_STUDENTS) document.documentElement.dataset.flowchart = 'on';
```

- [ ] **Step 4: README**

W sekcji „Krok po kroku (`src/lib/stepper.ts`)” dopisz akapit:

```markdown
Widok „Schemat” (`src/lib/flowchart/`): `checker.flowchart` zamienia kod na bloki, `layout.ts` układa schemat blokowy (program i osobno każda funkcja), `progress.ts` wylicza z kroków bieżący blok, wybraną strzałkę, wartość warunku i obroty pętli, a `render.ts` rysuje SVG. Kod, którego schemat nie zna (`try`, klasy…) albo ponad 40 bloków: przełącznika nie ma. Na razie widzi go tylko nauczyciel; dla wszystkich: `FLOWCHARTS_FOR_STUDENTS` w `src/pages/lesson.astro`.
```

- [ ] **Step 5: Build i testy**

Run: `npm test && npm run build`
Expected: testy OK, build „Complete!”.

- [ ] **Step 6: Sprawdzenie w przeglądarce (lokalnie)**

Run: `npm run dev`, otwórz lekcję 5 jako nauczyciel, w przykładzie z odliczaniem „Krok po kroku” → „Schemat”: kropka idzie po rombie i bloku, „2 > 0 → tak”, „obrót 1”, przy `0 > 0 → nie` wyróżniona strzałka do ostatniego bloku. Sprawdź też przykład z PIN-em (`break`), chatbot z `input`, „Zmień i uruchom” z dopisaną funkcją, ciemny motyw i wąskie okno (~375 px). Jeśli logowanie lokalnie nie jest możliwe, sprawdź po wdrożeniu (Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/lib/stepper.ts src/pages/lesson.astro src/styles/lesson-widgets.css README.md
git commit -m "Krok po kroku: Kod / Schemat switch, function variables; teacher-only for now"
```

---

### Task 6: wdrożenie

**Files:** brak zmian w kodzie.

- [ ] **Step 1:** `npm test && npm run build` na `feat/schematy`.
- [ ] **Step 2:** Merge do `main` (`git switch main && git merge --no-ff feat/schematy`), push (`git push origin main`): GitHub Pages wdraża stronę. Niezacommitowany styl „Pokaż wynik” w `global.css` nie wchodzi do merge, dopóki nie zapadnie decyzja.
- [ ] **Step 3:** Po wdrożeniu sprawdź na stronie jako nauczyciel i w „Podglądzie ucznia” (uczeń nie widzi przełącznika).
- [ ] **Step 4:** Później, osobno: merge `main` do `feat/kursy-ai`; włączenie dla uczniów (`FLOWCHARTS_FOR_STUDENTS = true`) i zamiana rysunku `petla` w lekcji 5.
