// Bajtek, the assistant at lesson notes (name in tutor-name.ts): wires up components/Bajtek.astro, a round button in
// the corner of the lesson page that opens a chat panel (the chat window shared with Kodek and Robcio). Nothing shows
// until the teacher switches Bajtek on. One conversation per course, kept in this browser, because Bajtek knows all
// the lessons the student has unlocked. "Zapytaj" next to sections and examples opens the panel with that fragment
// attached to the next question. The function reads the lessons itself; the page sends the conversation, the course
// and the lesson being read.
import type { DeepChat } from 'deep-chat';
import { supabase } from './supabase';
import { renderUntrustedMarkdown } from './markdown';
import { bubble, createChat, savedMessages, typing } from './chat-window';
import { BAJTEK_NAME } from './tutor-name';

type Quote = { label: string; text: string };

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // just not remembered
  }
};

const askButton = (title: string) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost bajtek-ask';
  button.textContent = 'Zapytaj';
  button.title = title;
  return button;
};

export async function mountBajtek(course: { id: string }, lesson: { number: number; title: string }, body: HTMLElement) {
  const found = document.querySelector<HTMLElement>('.bajtek');
  if (!found) return;
  const root = found;
  const { data: enabled } = await supabase.rpc('lms_bajtek_enabled');
  if (!enabled) return;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const fab = $<HTMLButtonElement>('.bajtek-fab');
  const panel = $('.bajtek-panel');
  const hint = $('.bajtek-hint');
  const host = $('.chat-host');
  const restart = $<HTMLButtonElement>('.restart');
  const left = $('.left');
  const quoteBox = $('.bajtek-quote');
  const storageKey = `kurs:bajtek:${course.id}`;
  root.hidden = false;

  let history = savedMessages(read(storageKey));
  const remember = () => write(storageKey, JSON.stringify(history));
  let quote: Quote | null = null;
  let chat: DeepChat | null = null;
  let chatReady: Promise<DeepChat> | null = null;

  /** Questions left today, from the same numbers as the account page. */
  async function showLeft() {
    const { data } = await supabase.rpc('lms_my_ai_usage');
    const usage = (data as { bajtek?: { used: number; limit: number } } | null)?.bajtek;
    left.textContent = usage ? `Dziś zostało pytań: ${Math.max(0, usage.limit - usage.used)}` : '';
  }

  function setQuote(next: Quote | null) {
    quote = next;
    quoteBox.hidden = !quote;
    quoteBox.querySelector('.bajtek-quote-text')!.textContent = quote ? `Pytasz o: ${quote.label}` : '';
  }
  quoteBox.querySelector('button')!.addEventListener('click', () => setQuote(null));

  /** A hello that is only on the screen: the model never sees it. */
  const greet = () =>
    chat?.addMessage({ role: 'ai', text: `Cześć, tu ${BAJTEK_NAME}. Znam lekcje tego kursu, które masz odblokowane. Zapytaj o coś, co jest niejasne. Zadań za Ciebie nie rozwiążę, od tego jest asystent przy zadaniu.` });

  /** The chat is created on the first opening, so a page where nobody asks does not download Deep Chat. */
  function ensureChat() {
    return (chatReady ??= makeChat());
  }
  async function makeChat() {
    await import('deep-chat');
    const created = createChat({ name: BAJTEK_NAME, placeholder: 'Np. Czym się różni elif od drugiego if?', height: '100%', characterLimit: 2000 });
    created.style.height = '100%';
    created.history = history.map(bubble);
    created.connect = {
      handler: async (request, signals) => {
        const typed = String(request?.messages?.at(-1)?.text ?? '').trim();
        if (!typed) return void signals.onResponse({ error: 'Pusta wiadomość.' });
        // the fragment goes to the model with the question; the bubble shows only what was typed
        history.push({ role: 'user', content: quote ? `${quote.text}\n\n${typed}` : typed });
        const sentQuote = quote;
        setQuote(null);
        typing(created, true);
        const { data, error } = await supabase.functions.invoke('lesson-assistant', {
          body: { messages: history.slice(-10), courseId: course.id, lessonNumber: lesson.number },
        });
        typing(created, false);
        if (error || typeof data?.reply !== 'string') {
          history.pop();
          setQuote(sentQuote);
          const message = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null);
          return void signals.onResponse({ error: message ?? `${BAJTEK_NAME} nie odpowiada. Spróbuj za chwilę.` });
        }
        history.push({ role: 'assistant', content: data.reply });
        remember();
        restart.hidden = false;
        void showLeft();
        await signals.onResponse({ html: renderUntrustedMarkdown(data.reply) });
      },
    };
    created.onComponentRender = () => {
      created.onComponentRender = undefined;
      restart.hidden = !history.length;
      // a moment later, as in assistant.ts: Deep Chat finishes wiring up after this callback
      if (!history.length) setTimeout(greet);
    };
    chat = created;
    host.replaceChildren(created);
    void showLeft();
    return created;
  }

  async function open(withQuote?: Quote, focus = true) {
    if (withQuote) setQuote(withQuote);
    panel.hidden = false;
    hint.hidden = true;
    fab.setAttribute('aria-expanded', 'true');
    root.classList.add('open');
    write('kurs:bajtek:open', '1');
    write('kurs:bajtek:hint', 'seen');
    const ready = await ensureChat();
    if (focus) setTimeout(() => ready.focusInput?.());
  }
  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    root.classList.remove('open');
    write('kurs:bajtek:open', '0');
    fab.focus();
  }

  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  $('.close').addEventListener('click', close);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
  restart.addEventListener('click', () => {
    history = [];
    remember();
    restart.hidden = true;
    chat?.clearMessages(true);
    greet();
  });

  // "Zapytaj" next to every section heading and every example of the lesson (not in the teacher's notes)
  for (const section of body.querySelectorAll<HTMLElement>('.lesson-section')) {
    const h2 = section.querySelector<HTMLElement>(':scope > h2');
    if (!h2) continue;
    const title = [...h2.childNodes].filter((n) => !(n instanceof Element && n.matches('.section-number'))).map((n) => n.textContent).join('').trim();
    const button = askButton(`Zapytaj o ten dział (${BAJTEK_NAME})`);
    button.addEventListener('click', () =>
      open({ label: `dział „${title}”`, text: `Pytanie o lekcję ${lesson.number} (${lesson.title}), dział „${title}”.` }),
    );
    h2.append(button);
  }
  for (const figure of body.querySelectorAll<HTMLElement>('figure.code-block.copyable')) {
    if (figure.closest('.teacher-inline')) continue;
    const caption = figure.querySelector('figcaption');
    if (!caption) continue;
    const button = askButton(`Zapytaj o ten przykład (${BAJTEK_NAME})`);
    button.addEventListener('click', () => {
      const code = figure.querySelector('pre')?.textContent ?? '';
      const lang = figure.dataset.fence ?? '';
      open({ label: 'przykład kodu', text: `Pytanie o ten przykład z lekcji ${lesson.number} (${lesson.title}):\n\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`` });
    });
    caption.firstElementChild ? caption.firstElementChild.before(button) : caption.append(button);
  }

  // the open panel comes back only on wide screens: on a phone it would cover the lesson
  if (read('kurs:bajtek:open') === '1' && matchMedia('(min-width: 700px)').matches) void open(undefined, false);
  else if (read('kurs:bajtek:hint') !== 'seen') hint.hidden = false;
}
