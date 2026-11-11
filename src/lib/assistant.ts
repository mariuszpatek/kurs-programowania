// The AI tutor at tasks (name in tutor-name.ts): wires up components/Assistant.astro with the chat window shared
// with Robcio. Nothing shows until the teacher switches the tutor on. The function reads the task, course and
// hints itself; the page sends the conversation, the code and the latest result. The conversation lasts as long
// as the browser tab.
import { supabase } from './supabase';
import { renderUntrustedMarkdown } from './markdown';
import { taskState } from './state';
import { bubble, createChat, savedMessages, typing, type Message } from './chat-window';
import { TUTOR_NAME } from './tutor-name';

export async function mountAssistant(taskId: string) {
  const root = document.querySelector<HTMLElement>('.assistant');
  if (!root) return;
  const { data: enabled } = await supabase.rpc('lms_assistant_enabled');
  if (!enabled) return;
  const host = root.querySelector<HTMLElement>('.chat-host')!;
  const restart = root.querySelector<HTMLButtonElement>('.restart')!;
  const left = root.querySelector<HTMLElement>('.left')!;
  const storageKey = `kurs:assistant:${taskId}`;
  root.hidden = false;

  let history: Message[] = [];
  try {
    history = savedMessages(sessionStorage.getItem(storageKey));
  } catch {
    // storage blocked: start a new conversation
  }
  const remember = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
      // the conversation is just not remembered
    }
  };

  /** Questions left today, from the same numbers as the account page. */
  async function showLeft() {
    const { data } = await supabase.rpc('lms_my_ai_usage');
    const usage = (data as { assistant?: { used: number; limit: number } } | null)?.assistant;
    left.textContent = usage ? `Dziś zostało pytań: ${Math.max(0, usage.limit - usage.used)}` : '';
  }

  /** A hello that is only on the screen: the model never sees it. */
  const greet = () => chat.addMessage({ role: 'ai', text: `Cześć, tu ${TUTOR_NAME}. Napisz, z czym masz kłopot. Podpowiem, ale rozwiązanie zostawię Tobie.` });

  await import('deep-chat');
  const chat = createChat({ name: TUTOR_NAME, placeholder: 'Np. Co znaczy ten błąd? Od czego zacząć?', height: '380px', characterLimit: 2000 });
  chat.history = history.map(bubble);
  chat.connect = {
    handler: async (body, signals) => {
      const text = String(body?.messages?.at(-1)?.text ?? '').trim();
      if (!text) return void signals.onResponse({ error: 'Pusta wiadomość.' });
      history.push({ role: 'user', content: text });
      typing(chat, true);
      const { data, error } = await supabase.functions.invoke('assistant', {
        body: { messages: history.slice(-10), taskId, code: taskState.code, result: taskState.lastResult },
      });
      typing(chat, false);
      if (error || typeof data?.reply !== 'string') {
        history.pop();
        const message = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null);
        return void signals.onResponse({ error: message ?? `${TUTOR_NAME} nie odpowiada. Spróbuj za chwilę.` });
      }
      history.push({ role: 'assistant', content: data.reply });
      remember();
      restart.hidden = false;
      void showLeft();
      await signals.onResponse({ html: renderUntrustedMarkdown(data.reply) });
    },
  };

  restart.addEventListener('click', () => {
    history = [];
    remember();
    restart.hidden = true;
    chat.clearMessages(true);
    greet();
  });

  chat.onComponentRender = () => {
    chat.onComponentRender = undefined;
    restart.hidden = !history.length;
    // a moment later, as in explain.ts: Deep Chat finishes wiring up after this callback
    if (!history.length) setTimeout(greet);
  };
  void showLeft();
  // after onComponentRender is set: the window may render as soon as it is on the page
  host.replaceChildren(chat);
}
