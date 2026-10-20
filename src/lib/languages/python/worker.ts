/// <reference lib="webworker" />
// Python (Pyodide) runs in its own thread so an endless loop cannot freeze the page.
// When a run takes too long the page simply terminates this worker and starts a new one.

const PYODIDE = 'https://cdn.jsdelivr.net/npm/pyodide@314.0.7/';

/** Where ask() / chat() send their requests: the `llm` edge function, as the signed-in user. */
type ModelAuth = { url: string; anonKey: string; token: string };
type Job = { id: number; kind: 'run' | 'check' | 'predict' | 'trace'; code: string; stdin?: string; tests?: string; auth?: ModelAuth };

let ready: Promise<any> | null = null;
let auth: ModelAuth | undefined;

// Called by checker.py while student code runs. Synchronous, so the student's Python needs no async:
// a blocking request is allowed in a worker and the page stays responsive.
function modelRequest(body: string): string {
  if (!auth) return JSON.stringify({ error: 'Zaloguj się, żeby korzystać z modelu.' });
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${auth.url}/functions/v1/llm`, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);
    xhr.setRequestHeader('apikey', auth.anonKey);
    xhr.send(body);
    try {
      JSON.parse(xhr.responseText);
      return xhr.responseText;
    } catch {
      return JSON.stringify({ error: `Model nie odpowiedział poprawnie (HTTP ${xhr.status}).` });
    }
  } catch {
    return JSON.stringify({ error: 'Brak połączenia z modelem. Sprawdź internet i spróbuj jeszcze raz.' });
  }
}

async function boot(checkerUrl: string) {
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  const source = await (await fetch(checkerUrl)).text();
  pyodide.FS.writeFile('/home/pyodide/checker.py', source);
  await pyodide.runPythonAsync('import json, checker');
  pyodide.globals.get('checker').LLM_BACKEND = modelRequest;
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
    auth = job.auth;
    pyodide.globals.set('_code', job.code);
    pyodide.globals.set('_stdin', job.stdin ?? '');
    pyodide.globals.set('_tests', job.tests ?? '');
    self.postMessage({ id: job.id, result: JSON.parse(pyodide.runPython(EXPRESSIONS[job.kind])) });
  } catch (err) {
    self.postMessage({ id: job.id, systemError: String(err) });
  }
};
