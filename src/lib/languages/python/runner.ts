import { url } from '../../url';
import { supabase } from '../../supabase';
import { TimedOut, type CheckResult, type PredictResult, type RunResult, type Runner, type TraceResult } from '../types';

const TIME_LIMIT_MS = { run: 5000, check: 15000, predict: 5000, trace: 5000 };
/** Code that talks to the language model waits for its answers, so it gets more time. */
const MODEL_TIME_LIMIT_MS = 120_000;
const usesModel = (code: string) => /\b(ask|chat)\s*\(/.test(code);
/** The first import of a big package downloads it (several seconds), so such code also gets more time. */
const PACKAGES_TIME_LIMIT_MS = 60_000;
const usesPackages = (code: string) => /^\s*(import|from)\s+(numpy|pandas|sklearn|pydantic|scipy)\b/m.test(code);

async function modelAuth() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { url: import.meta.env.PUBLIC_SUPABASE_URL, anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY, token } : undefined;
}

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
  const live = kind !== 'predict' && usesModel(payload.code);
  const auth = live ? await modelAuth() : undefined;
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      booting = null;
      preparePython();
      reject(new TimedOut());
    }, live ? MODEL_TIME_LIMIT_MS : usesPackages(`${payload.code}\n${payload.tests ?? ''}`) ? PACKAGES_TIME_LIMIT_MS : TIME_LIMIT_MS[kind]);
    pending.set(id, {
      resolve: (r) => (clearTimeout(timer), resolve(r)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    worker!.postMessage({ id, kind, ...payload, auth });
  });
}

export const pythonRunner: Runner = {
  prepare: preparePython,
  run: (code, stdin) => send<RunResult>('run', { code, stdin }),
  check: (code, tests) => send<CheckResult>('check', { code, tests }),
  predict: (code, guess) => send<PredictResult>('predict', { code, stdin: guess }),
  trace: (code, stdin) => send<TraceResult>('trace', { code, stdin }),
};
