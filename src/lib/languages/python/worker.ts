/// <reference lib="webworker" />
// Python (Pyodide) runs in its own thread so an endless loop cannot freeze the page.
// When a run takes too long the page simply terminates this worker and starts a new one.

const PYODIDE = 'https://cdn.jsdelivr.net/npm/pyodide@314.0.7/';

type Job = { id: number; kind: 'run' | 'check' | 'predict' | 'trace'; code: string; stdin?: string; tests?: string };

let ready: Promise<any> | null = null;

async function boot(checkerUrl: string) {
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  const source = await (await fetch(checkerUrl)).text();
  pyodide.FS.writeFile('/home/pyodide/checker.py', source);
  await pyodide.runPythonAsync('import json, checker');
  return pyodide;
}

const EXPRESSIONS = {
  run: 'json.dumps(checker.run(_code, _stdin).to_dict())',
  check: 'json.dumps(checker.check(_code, _tests))',
  predict: 'json.dumps(checker.compare_prediction(_code, _stdin))',
  trace: 'json.dumps(checker.trace(_code, _stdin))',
};

self.onmessage = async (e: MessageEvent) => {
  if (e.data.boot) {
    ready = boot(e.data.boot);
    try {
      await ready;
      self.postMessage({ ready: true });
    } catch (err) {
      self.postMessage({ ready: false, error: String(err) });
    }
    return;
  }

  const job = e.data as Job;
  try {
    const pyodide = await ready!;
    pyodide.globals.set('_code', job.code);
    pyodide.globals.set('_stdin', job.stdin ?? '');
    pyodide.globals.set('_tests', job.tests ?? '');
    self.postMessage({ id: job.id, result: JSON.parse(pyodide.runPython(EXPRESSIONS[job.kind])) });
  } catch (err) {
    self.postMessage({ id: job.id, systemError: String(err) });
  }
};
