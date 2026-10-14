import { url } from '../../url';
import { TimedOut, type CheckResult, type PredictResult, type RunResult, type Runner } from '../types';

const TIME_LIMIT_MS = { run: 5000, check: 15000, predict: 5000 };

let worker: Worker | null = null;
let booting: Promise<void> | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();

function startWorker(): Promise<void> {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  booting = new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const d = e.data;
      if ('ready' in d) {
        d.ready ? resolve() : reject(new Error(`Nie udało się uruchomić Pythona: ${d.error}`));
        return;
      }
      const job = pending.get(d.id);
      if (!job) return;
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

async function send<T>(kind: keyof typeof TIME_LIMIT_MS, payload: Record<string, string>): Promise<T> {
  await preparePython();
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      booting = null;
      preparePython();
      reject(new TimedOut());
    }, TIME_LIMIT_MS[kind]);
    pending.set(id, {
      resolve: (r) => (clearTimeout(timer), resolve(r)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    worker!.postMessage({ id, kind, ...payload });
  });
}

export const pythonRunner: Runner = {
  prepare: preparePython,
  run: (code, stdin) => send<RunResult>('run', { code, stdin }),
  check: (code, tests) => send<CheckResult>('check', { code, tests }),
  predict: (code, guess) => send<PredictResult>('predict', { code, stdin: guess }),
};
