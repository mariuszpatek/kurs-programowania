// input() in the console (src/lib/languages/python/worker.ts). The Python thread waits for the student's answer
// with a synchronous request to __input__/read?key=…, and the page hands the answer over with postMessage.
// Registered on every page (src/layouts/Layout.astro). Every other request passes through untouched.
const WAIT_MS = 25000;
/** Answers that arrived before the thread asked for them. */
const answers = new Map();
/** Requests of the thread waiting for an answer: key → resolve. */
const waiting = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  const { key, answer } = event.data ?? {};
  if (typeof key !== 'string') return;
  const resolve = waiting.get(key);
  if (resolve) {
    waiting.delete(key);
    resolve(answer);
  } else {
    answers.set(key, answer);
  }
});

const reply = (answer) => new Response(JSON.stringify({ answer: answer ?? null }), { headers: { 'Content-Type': 'application/json' } });

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes('/__input__/')) return;
  if (url.pathname.endsWith('/ping')) {
    event.respondWith(new Response('ok'));
    return;
  }
  const key = url.searchParams.get('key') ?? '';
  if (answers.has(key)) {
    const answer = answers.get(key);
    answers.delete(key);
    event.respondWith(reply(answer));
    return;
  }
  // no answer yet: hold the request; after WAIT_MS an empty 204 and the thread asks again
  event.respondWith(
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(key);
        resolve(new Response(null, { status: 204 }));
      }, WAIT_MS);
      waiting.set(key, (answer) => {
        clearTimeout(timer);
        resolve(reply(answer));
      });
    }),
  );
});
