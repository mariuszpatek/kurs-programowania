import { url } from '../../url';
import { supabase } from '../../supabase';
import { TimedOut, type CheckResult, type InputHandler, type PredictResult, type RunResult, type Runner, type TraceResult } from '../types';

const TIME_LIMIT_MS = { run: 5000, check: 15000, predict: 5000, trace: 5000 };
/** Code that talks to the language model waits for its answers, so it gets more time. */
const MODEL_TIME_LIMIT_MS = 120_000;
const usesModel = (code: string) => /\b(ask|chat)\s*\(/.test(code);
/** The first import of a big package downloads it (several seconds), so such code also gets more time. */
const PACKAGES_TIME_LIMIT_MS = 60_000;
const usesPackages = (code: string) => /^\s*(import|from)\s+(numpy|pandas|sklearn|pydantic|scipy|polars|duckdb|sqlalchemy)\b/m.test(code);

async function modelAuth() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { url: import.meta.env.PUBLIC_SUPABASE_URL, anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY, token } : undefined;
}

let worker: Worker | null = null;
let booting: Promise<void> | null = null;
let nextId = 0;
/** Whether input() can ask in the console (the worker reached public/input-sw.js). */
let consoleInput = false;
type Pending = { resolve: (r: any) => void; reject: (e: Error) => void; waiting?: (w: { key: string; output: string }) => void };
const pending = new Map<number, Pending>();

function startWorker(): Promise<void> {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  booting = new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const d = e.data;
      if ('ready' in d) {
        consoleInput = Boolean(d.consoleInput);
        d.ready ? resolve() : reject(new Error(`Nie udało się uruchomić Pythona: ${d.error}`));
        return;
      }
      const job = pending.get(d.id);
      if (!job) return;
      if (d.waiting) {
        job.waiting?.(d.waiting);
        return;
      }
      pending.delete(d.id);
      d.systemError ? job.reject(new Error(d.systemError)) : job.resolve(d.result);
    };
  });
  w.postMessage({ boot: new URL(url('py/checker.py'), location.href).href });
  return booting;
}

/** Starts loading Python in the background; call as soon as a page with an editor opens. */
function preparePython(): Promise<void> {
  return booting ?? startWorker();
}

/** Hands the student's answer (null: "Zatrzymaj") to the service worker, where the waiting worker picks it up. */
async function sendAnswer(key: string, answer: string | null) {
  const sw = navigator.serviceWorker.controller ?? (await navigator.serviceWorker.ready).active;
  sw?.postMessage({ key, answer });
}

async function send<T>(kind: keyof typeof TIME_LIMIT_MS, payload: Record<string, string>, onInput?: InputHandler): Promise<T> {
  await preparePython();
  const live = kind !== 'predict' && usesModel(payload.code);
  const auth = live ? await modelAuth() : undefined;
  const id = ++nextId;
  const limit = live ? MODEL_TIME_LIMIT_MS : usesPackages(`${payload.code}\n${payload.tests ?? ''}`) ? PACKAGES_TIME_LIMIT_MS : TIME_LIMIT_MS[kind];
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    // the limit counts computing only: it stops while the program waits for the student and starts again after
    const startTimer = () =>
      (timer = setTimeout(() => {
        pending.delete(id);
        worker?.terminate();
        worker = null;
        booting = null;
        preparePython();
        reject(new TimedOut());
      }, limit));
    startTimer();
    pending.set(id, {
      resolve: (r) => (clearTimeout(timer), resolve(r)),
      reject: (e) => (clearTimeout(timer), reject(e)),
      waiting: async ({ key, output }) => {
        clearTimeout(timer);
        const answer = await onInput!(output).catch(() => null);
        await sendAnswer(key, answer);
        if (pending.has(id)) startTimer();
      },
    });
    worker!.postMessage({ id, kind, ...payload, auth, consoleInput: Boolean(onInput) });
  });
}

export const pythonRunner: Runner = {
  prepare: preparePython,
  consoleInput: () => consoleInput,
  run: (code, stdin, onInput) => send<RunResult>('run', { code, stdin }, onInput),
  check: (code, tests) => send<CheckResult>('check', { code, tests }),
  predict: (code, guess) => send<PredictResult>('predict', { code, stdin: guess }),
  trace: (code, stdin) => send<TraceResult>('trace', { code, stdin }),
};
