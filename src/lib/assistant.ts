import { supabase } from './supabase';
import { renderUntrustedMarkdown } from './markdown';
import { taskState } from './state';

type Message = { role: 'user' | 'assistant'; content: string };

/** Wires up components/Assistant.astro; does nothing when the assistant is disabled. */
export function mountAssistant(context: { taskId: string; task: string; topics: string }) {
  const root = document.querySelector<HTMLElement>('.assistant');
  if (!root) return;
  root.hidden = false;
  const form = root.querySelector('form')!;
  const input = form.querySelector('textarea')!;
  const chat = root.querySelector<HTMLElement>('.chat')!;
  const storageKey = `kurs:assistant:${context.taskId}`;

  let history: Message[] = [];
  try {
    history = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
  } catch {
    history = [];
  }

  const append = (m: Message) => {
    const div = document.createElement('div');
    div.className = `message ${m.role === 'user' ? 'user' : 'assistant-reply'}`;
    if (m.role === 'assistant') div.innerHTML = renderUntrustedMarkdown(m.content);
    else div.textContent = m.content;
    chat.append(div);
    div.scrollIntoView({ block: 'nearest' });
    return div;
  };
  history.forEach(append);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    const button = form.querySelector('button')!;
    button.disabled = true;
    history.push({ role: 'user', content: question });
    append(history.at(-1)!);
    const waiting = append({ role: 'assistant', content: '…' });

    const { data, error } = await supabase.functions.invoke('assistant', {
      body: { messages: history.slice(-10), task: context.task, topics: context.topics, code: taskState.code, result: taskState.lastResult },
    });
    waiting.remove();
    if (error || !data?.reply) {
      const body = await (error as any)?.context?.json?.().catch(() => null);
      append({ role: 'assistant', content: `⚠️ ${body?.error ?? 'Asystent nie odpowiada. Spróbuj za chwilę.'}` });
      history.pop();
    } else {
      history.push({ role: 'assistant', content: data.reply });
      append(history.at(-1)!);
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
      // the conversation is just not remembered
    }
    button.disabled = false;
  });
}
