// The debugger at tasks, inside the editor (workspace.ts): breakpoints in a narrow column left of the line numbers
// (a click puts a dot, another click takes it away; they move with the code while it is edited), the lines of
// "Krok po kroku" marked in the code itself instead of a copy under it, and the editor locked while stepping.
// editorCodeView() is the editor as the code view of stepper.ts.
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, type DecorationSet } from '@codemirror/view';
import { Compartment, EditorState, RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import type { CodeView } from './stepper';

// ---------------------------------------------------------------- breakpoints

const toggleBreakpoint = StateEffect.define<{ pos: number; on: boolean }>();

class Dot extends GutterMarker {
  constructor(readonly on: boolean) {
    super();
  }
  eq(other: Dot) {
    return other.on === this.on;
  }
  toDOM() {
    const dot = document.createElement('span');
    dot.className = this.on ? 'cm-breakpoint on' : 'cm-breakpoint';
    dot.textContent = '●';
    return dot;
  }
}
const dot = new Dot(true);
// every line gets a faint dot, so there is something to hover over and click
const emptyDot = new Dot(false);

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(toggleBreakpoint)) continue;
      set = e.value.on ? set.update({ add: [dot.range(e.value.pos)] }) : set.update({ filter: (from) => from !== e.value.pos });
    }
    return set;
  },
});

function toggle(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  let on = true;
  view.state.field(breakpointField).between(line.from, line.from, () => {
    on = false;
  });
  view.dispatch({ effects: toggleBreakpoint.of({ pos: line.from, on }) });
}

/** Line numbers (1-based) with a breakpoint. */
export function breakpointLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  view.state.field(breakpointField).between(0, view.state.doc.length, (from) => {
    lines.add(view.state.doc.lineAt(from).number);
  });
  return lines;
}

// ---------------------------------------------------------------- lines of "Krok po kroku"

/** A line marked by the player: kind done / next / failed / computing, a label at its end and, while a line is
 * computed value by value, that computation under it (HTML from stepper.ts, already escaped). */
type DebugMark = { line: number; kind: string; tag: string; html?: string };

const setMarks = StateEffect.define<DebugMark[]>();

class TagWidget extends WidgetType {
  constructor(readonly text: string, readonly kind: string) {
    super();
  }
  eq(other: TagWidget) {
    return other.text === this.text && other.kind === this.kind;
  }
  toDOM() {
    const tag = document.createElement('span');
    tag.className = `cm-debug-tag ${this.kind}`;
    tag.textContent = this.text;
    return tag;
  }
}

class ComputeWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }
  eq(other: ComputeWidget) {
    return other.html === this.html;
  }
  toDOM() {
    const box = document.createElement('div');
    box.className = 'cm-debug-compute';
    box.innerHTML = this.html;
    return box;
  }
}

function decorations(state: EditorState, marks: DebugMark[]): DecorationSet {
  const ranges = [];
  for (const m of [...marks].sort((a, b) => a.line - b.line)) {
    if (m.line < 1 || m.line > state.doc.lines) continue;
    const line = state.doc.line(m.line);
    ranges.push(Decoration.line({ class: `cm-debug-${m.kind}` }).range(line.from));
    if (m.tag) ranges.push(Decoration.widget({ widget: new TagWidget(m.tag, m.kind), side: 1 }).range(line.to));
    if (m.html) ranges.push(Decoration.widget({ widget: new ComputeWidget(m.html), side: 2, block: true }).range(line.to));
  }
  return Decoration.set(ranges, true);
}

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setMarks)) deco = decorations(tr.state, e.value);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------------------------------------------------------------- locking

const lock = new Compartment();

/** While stepping the code must not change: the marks are for the code that was recorded. */
export function setLocked(view: EditorView, locked: boolean) {
  view.dispatch({
    effects: [
      // the class goes through the editor's attributes: CodeMirror rewrites the classes of its element itself
      lock.reconfigure(locked ? [EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.editorAttributes.of({ class: 'cm-debugging' })] : []),
      ...(locked ? [] : [setMarks.of([])]),
    ],
  });
}

/** The editor as the code view of the player: marks are gathered and dispatched once per step. */
export function editorCodeView(view: EditorView): CodeView {
  let marks = new Map<number, DebugMark>();
  let scheduled = false;
  const flush = () => {
    if (!scheduled) return;
    scheduled = false;
    // a step drawn just before "Zakończ" must not mark the unlocked editor again
    if (!view.state.readOnly) return;
    const list = [...marks.values()];
    const current = list.find((m) => m.kind !== 'next') ?? list[0];
    const pos = current && current.line <= view.state.doc.lines ? view.state.doc.line(current.line).from : null;
    view.dispatch({ effects: [setMarks.of(list), ...(pos === null ? [] : [EditorView.scrollIntoView(pos, { y: 'nearest' })])] });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  };
  return {
    clear() {
      marks = new Map();
      schedule();
    },
    setLine(n, kind, tag, html) {
      if (kind) marks.set(n + 1, { line: n + 1, kind, tag, html });
      else marks.delete(n + 1);
      schedule();
    },
    lineElement(n) {
      flush();
      if (n + 1 > view.state.doc.lines) return null;
      const { node } = view.domAtPos(view.state.doc.line(n + 1).from);
      const line = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('.cm-line');
      return line ?? null;
    },
  };
}

// ---------------------------------------------------------------- the extension

const theme = EditorView.baseTheme({
  '.cm-breakpoint-gutter .cm-gutterElement': { cursor: 'pointer', padding: '0 2px 0 4px' },
  '.cm-breakpoint': { color: 'transparent', fontSize: '11px' },
  '.cm-breakpoint-gutter .cm-gutterElement:hover .cm-breakpoint': { color: 'var(--line-strong)' },
  '.cm-breakpoint.on, .cm-breakpoint-gutter .cm-gutterElement:hover .cm-breakpoint.on': { color: 'var(--bad)' },
  '.cm-debug-done': { backgroundColor: 'var(--accent-bg)', boxShadow: 'inset 3px 0 0 var(--accent)' },
  '.cm-debug-next': { boxShadow: 'inset 3px 0 0 var(--text-3)' },
  '.cm-debug-failed': { backgroundColor: 'var(--bad-bg)', boxShadow: 'inset 3px 0 0 var(--bad)' },
  '.cm-debug-computing': {
    backgroundColor: 'color-mix(in srgb, var(--code-number) 9%, var(--surface))',
    boxShadow: 'inset 3px 0 0 var(--code-number)',
  },
  '.cm-debug-tag': { marginLeft: '14px', fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text-3)' },
  '.cm-debug-tag.done': { color: 'var(--accent)' },
  '.cm-debug-tag.failed': { color: 'var(--bad)' },
  '.cm-debug-tag.computing': { color: 'var(--code-number)' },
  '.cm-debug-compute': {
    padding: '2px 16px 2px 40px',
    backgroundColor: 'color-mix(in srgb, var(--code-number) 9%, var(--surface))',
    fontFamily: 'var(--mono)',
  },
  '.cm-debug-compute::before': { content: '"⋯ liczy:  "', color: 'var(--code-number)', fontFamily: 'var(--sans)', fontSize: '12px' },
  '.cm-debug-compute mark': {
    padding: '1px 3px',
    borderRadius: '4px',
    background: 'color-mix(in srgb, var(--code-number) 24%, var(--surface))',
    color: 'var(--text)',
    fontWeight: '600',
  },
  '&.cm-debugging .cm-cursor': { display: 'none' },
});

/** Breakpoints, marks and the lock; goes before basicSetup, so the breakpoint column is left of the line numbers. */
export function debugExtension(): Extension {
  return [
    breakpointField,
    gutter({
      class: 'cm-breakpoint-gutter',
      markers: (view) => view.state.field(breakpointField),
      lineMarker: (_view, _line, others) => (others.length ? null : emptyDot),
      lineMarkerChange: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(toggleBreakpoint))),
      initialSpacer: () => emptyDot,
      domEventHandlers: {
        mousedown(view, line) {
          toggle(view, line.from);
          return true;
        },
      },
    }),
    marksField,
    lock.of([]),
    theme,
  ];
}
