import type { Extension } from '@codemirror/state';

export type CodeError = { type: string; message: string; line: number | null; line_text: string | null; hint: string | null };
export type RunResult = { output: string; error: CodeError | null };
export type TestResult = { name: string; ok: boolean; message: string | null };
export type CheckResult = { passed: boolean; tests: TestResult[]; run: RunResult | null };
export type PredictLine = { student: string | null; actual: string | null; ok: boolean };
export type PredictResult = { passed: boolean; lines: PredictLine[]; error: CodeError | null };

/** One step of a "step by step" view: the state right after `line` ran (null: before the start). */
export type TraceStep = {
  line: number | null;
  variables: { name: string; type: string; value: string }[];
  output: string;
  error: CodeError | null;
};
export type TraceResult = { steps: TraceStep[]; error: CodeError | null };

export class TimedOut extends Error {}

/** Executes and checks student code in the browser. */
export type Runner = {
  /** Starts loading in the background; call as soon as a page with an editor opens. */
  prepare(): Promise<void>;
  run(code: string, stdin: string): Promise<RunResult>;
  check(code: string, tests: string): Promise<CheckResult>;
  predict(code: string, guess: string): Promise<PredictResult>;
  /** Records the program line by line for the "step by step" view in lessons. */
  trace?(code: string, stdin: string): Promise<TraceResult>;
};

/** Everything the site needs to know about one programming language. */
export type Language = {
  id: string;
  /** Shown to students, e.g. "Python". */
  label: string;
  /** Fence names accepted in lesson Markdown, e.g. ["python", "py"]. */
  aliases: string[];
  /** File name shown on the editor tab. */
  fileName: string;
  editorExtension: () => Extension;
  /** Returns HTML with token spans (classes styled in global.css). */
  highlight: (code: string) => string;
  /** Absent when code in this language cannot run in the browser yet. */
  runner?: Runner;
};
