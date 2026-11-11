/// <reference lib="webworker" />
// Python (Pyodide) runs in its own thread so an endless loop cannot freeze the page.
// When a run takes too long the page simply terminates this worker and starts a new one.

const PYODIDE = 'https://cdn.jsdelivr.net/npm/pyodide@314.0.7/';

/** Where ask() / chat() send their requests: the `llm` edge function, as the signed-in user. */
type ModelAuth = { url: string; anonKey: string; token: string };
type Job = { id: number; kind: 'run' | 'check' | 'predict' | 'trace'; code: string; stdin?: string; tests?: string; auth?: ModelAuth; consoleInput?: boolean };

let ready: Promise<any> | null = null;
let auth: ModelAuth | undefined;

// input() in the console: the answer comes through the service worker public/input-sw.js. `inputUrl` is null
// when it does not answer (first visit, blocked, a browser that does not route a worker's requests through it);
// then input() only reads the "Dane dla input()" field.
let inputUrl: string | null = null;
let currentJob = 0;
const session = Math.random().toString(36).slice(2);
let asked = 0;

function syncGet(url: string): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.send();
  return xhr;
}

function serviceWorkerAnswers(base: string): boolean {
  try {
    const xhr = syncGet(`${base}ping`);
    return xhr.status === 200 && xhr.responseText === 'ok';
  } catch {
    return false;
  }
}

// Called by checker.py when the field runs out. Shows the output so far on the page, then blocks until the
// student answers in the console; undefined = "Zatrzymaj" (or the service worker is gone).
function waitForInput(output: string): string | undefined {
  const key = `${session}-${++asked}`;
  self.postMessage({ id: currentJob, waiting: { key, output } });
  try {
    for (;;) {
      const xhr = syncGet(`${inputUrl}read?key=${encodeURIComponent(key)}`);
      if (xhr.status === 204) continue;
      if (xhr.status !== 200) return undefined;
      const { answer } = JSON.parse(xhr.responseText);
      return typeof answer === 'string' ? answer : undefined;
    }
  } catch {
    return undefined;
  }
}

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
  const base = new URL('../__input__/', checkerUrl).href;
  if (serviceWorkerAnswers(base)) inputUrl = base;
  pyodide.globals.set('_wait_for_input', waitForInput);
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
      self.postMessage({ ready: true, consoleInput: inputUrl !== null });
    } catch (err) {
      self.postMessage({ ready: false, error: String(err) });
    }
    return;
  }

  const job = e.data as Job;
  try {
    const pyodide = await ready!;
    auth = job.auth;
    // numpy, pydantic, pandas, scikit-learn … are fetched from the CDN the first time the code imports them
    await pyodide.loadPackagesFromImports(`${job.code}\n${job.tests ?? ''}`);
    pyodide.globals.set('_code', job.code);
    pyodide.globals.set('_stdin', job.stdin ?? '');
    pyodide.globals.set('_tests', job.tests ?? '');
    // only "Uruchom" asks in the console; tests, predict and trace read their prepared input
    currentJob = job.id;
    pyodide.globals.set('_console_input', job.kind === 'run' && Boolean(job.consoleInput) && inputUrl !== null);
    pyodide.runPython('checker.INPUT_BACKEND = _wait_for_input if _console_input else None');
    self.postMessage({ id: job.id, result: JSON.parse(pyodide.runPython(EXPRESSIONS[job.kind])) });
  } catch (err) {
    self.postMessage({ id: job.id, systemError: String(err) });
  }
};
