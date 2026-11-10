// "Wytłumacz koledze" (beta): wires up components/Explain.astro. The chat window is Deep Chat (loaded only on
// these tasks); the conversation goes through the edge function `explain`, which also saves the attempt with
// the summary. This browser only remembers the unfinished chat; a finished one comes back from that attempt.
import type { DeepChat } from 'deep-chat';
import { supabase, currentUser } from './supabase';
import { renderUntrustedMarkdown } from './markdown';
import { escapeHtml } from './languages/highlight';

type Message = { role: 'user' | 'assistant'; content: string };
type Level = 'umie' | 'czesciowo' | 'nie';
// name/verdict: summaries saved before the teacher's summary prompt
type Concept = { concept?: string; level?: Level; name?: string; verdict?: Level; comment: string };
type Summary = { concepts: Concept[]; advice: string };

const LEVEL: Record<Level, string> = { umie: '✓ umiesz', czesciowo: '~ częściowo', nie: '✗ jeszcze nie' };

const bubble = (m: Message) =>
  m.role === 'user' ? { role: 'user', text: m.content } : { role: 'ai', html: renderUntrustedMarkdown(m.content) };

/** Deep Chat styled with the site's colours (CSS variables reach into its shadow DOM). */
function createChat(): DeepChat {
  const chat = document.createElement('deep-chat') as DeepChat;
  chat.style.display = 'block';
  chat.style.width = '100%';
  chat.chatStyle = {
    width: '100%',
    height: '480px',
    border: '1px solid var(--line)',
    borderRadius: '12px',
    backgroundColor: 'var(--surface)',
    fontFamily: 'inherit',
    fontSize: '15px',
  };
  chat.messageStyles = {
    default: {
      shared: { bubble: { maxWidth: '85%', lineHeight: '1.5', padding: '8px 12px' } },
      user: { bubble: { backgroundColor: 'var(--accent)', color: '#fff' } },
      ai: { bubble: { backgroundColor: 'var(--surface-2)', color: 'var(--text)' } },
    },
    html: { shared: { bubble: { maxWidth: '85%', lineHeight: '1.5', padding: '8px 12px' } }, ai: { bubble: { backgroundColor: 'var(--surface-2)', color: 'var(--text)' } } },
    error: { bubble: { backgroundColor: 'var(--bad-bg)', color: 'var(--bad)' } },
  };
  chat.names = { ai: { text: 'Robcio', style: { color: 'var(--text-2)' } }, user: { text: 'Ty', style: { color: 'var(--text-2)' } } };
  chat.textInput = {
    placeholder: { text: 'Twoje wyjaśnienie…' },
    characterLimit: 2000,
    styles: {
      container: { backgroundColor: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: '10px', width: '90%' },
      text: { color: 'var(--text)', padding: '8px 10px' },
    },
  };
  chat.errorMessages = { displayServiceErrorMessages: true };
  // the "…" bubble is switched by hand (Deep Chat replaces toggle when it renders), so it also shows while
  // Robcio writes his first message, which Deep Chat itself does not ask for
  chat.displayLoadingBubble = { toggle: () => {} };
  return chat;
}

const typingShown = new WeakSet<DeepChat>();

/** Shows or hides the "Robcio is writing" dots. Deep Chat's toggle() adds new dots when they are not the last
 * bubble, so it is called only when the state really changes and nothing else is added in between. */
const typing = (chat: DeepChat, on: boolean) => {
  const bubble = chat.displayLoadingBubble;
  if (typeof bubble !== 'object' || on === typingShown.has(chat)) return;
  if (on) typingShown.add(chat);
  else typingShown.delete(chat);
  bubble.toggle(on ? { role: 'ai' } : undefined);
};

export async function mountExplain(root: HTMLElement, task: { id: string }) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const host = $('.chat-host');
  const finish = $<HTMLButtonElement>('.finish');
  const restart = $<HTMLButtonElement>('.restart');
  const left = $('.left');
  const summaryBox = $('.summary');
  // v2: conversations started before Kuba became Robcio are not replayed
  const storageKey = `kurs:explain:v2:${task.id}`;
  root.hidden = false;

  let history: Message[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    // a message without text (left by an older version) would break the whole chat
    history = Array.isArray(saved)
      ? saved.filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
      : [];
  } catch {
    history = [];
  }
  const remember = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
      // the conversation is just not remembered
    }
  };
  let done = false;
  const canFinish = () => (finish.disabled = done || !history.some((m) => m.role === 'user'));

  /** The function's answer, or { error } with a sentence for the student. */
  async function call(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('explain', { body: { taskId: task.id, ...body } });
    if (!error) return data;
    const message = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null);
    return { error: message ?? 'Robcio nie odpowiada. Spróbuj za chwilę.' };
  }

  await import('deep-chat');
  const chat = createChat();
  chat.history = history.map(bubble);
  chat.connect = {
    handler: async (body, signals) => {
      const text = String(body?.messages?.at(-1)?.text ?? '').trim();
      if (done || !text) return void signals.onResponse({ error: 'Rozmowa jest zakończona.' });
      history.push({ role: 'user', content: text });
      remember();
      canFinish();
      typing(chat, true);
      const data = await call({ messages: history });
      typing(chat, false);
      if (data.error) {
        history.pop();
        remember();
        canFinish();
        return void signals.onResponse({ error: data.error });
      }
      if (data.summary) {
        // the last allowed message: the function summed the conversation up instead of answering
        await signals.onResponse({ html: renderUntrustedMarkdown('To była ostatnia wiadomość w tej rozmowie. Podsumowanie jest pod spodem.') });
        return finished(data);
      }
      if (typeof data.reply !== 'string') return void signals.onResponse({ error: 'Robcio nie odpowiada. Spróbuj za chwilę.' });
      history.push({ role: 'assistant', content: data.reply });
      remember();
      left.textContent = [
        data.left > 0 ? `W tej rozmowie zostało wiadomości: ${data.left}` : '',
        typeof data.todayLeft === 'number' ? `dziś: ${data.todayLeft}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      await signals.onResponse({ html: renderUntrustedMarkdown(data.reply) });
      if (data.left <= 0) void summarize();
    },
  };
  /** Robcio speaks first in a new conversation. */
  async function greet() {
    // the student writes after Robcio has said hello, so nothing lands under the dots
    chat.disableSubmitButton(true);
    typing(chat, true);
    const data = await call({ messages: [] });
    typing(chat, false);
    if (!done) chat.disableSubmitButton(false);
    if (data.error || typeof data.reply !== 'string') {
      return chat.addMessage({ role: 'ai', error: data.error ?? 'Robcio nie odpowiada. Spróbuj za chwilę.' });
    }
    history.push({ role: 'assistant', content: data.reply });
    remember();
    chat.addMessage({ role: 'ai', html: renderUntrustedMarkdown(data.reply) });
  }

  async function summarize() {
    finish.disabled = true;
    finish.textContent = 'Podsumowuję…';
    const data = await call({ messages: history, finish: true });
    finish.textContent = 'Zakończ i podsumuj';
    if (data.error) {
      chat.addMessage({ role: 'ai', error: data.error });
      return canFinish();
    }
    finished(data);
  }

  function finished(data: { summary: Summary; passed: boolean }) {
    // the conversation is saved with the attempt now, so this browser can forget it
    history = [];
    remember();
    showSummary(data.summary, data.passed);
    window.dispatchEvent(new CustomEvent('kurs:attempt', { detail: { taskId: task.id, passed: data.passed } }));
  }

  function showSummary(summary: Summary, passed: boolean) {
    done = true;
    chat.disableSubmitButton(true);
    chat.setPlaceholderText('Rozmowa zakończona. Podsumowanie jest pod spodem.');
    canFinish();
    const good = summary.concepts.filter((c) => (c.level ?? c.verdict) === 'umie').length;
    const verdict = passed
      ? 'Zaliczone. Umiesz to wytłumaczyć.'
      : `${good} z ${summary.concepts.length} pojęć wyjaśnione w pełni. Popraw resztę i spróbuj jeszcze raz.`;
    summaryBox.innerHTML = `<p class="eyebrow">Podsumowanie</p>
      <p><strong>${verdict}</strong></p>
      <ul>${summary.concepts
        .map((c) => {
          const level = (c.level ?? c.verdict ?? 'nie') as Level;
          return `<li><span class="verdict-${level}">${LEVEL[level] ?? ''}</span> <strong>${escapeHtml(c.concept ?? c.name ?? '')}</strong>: ${escapeHtml(c.comment)}</li>`;
        })
        .join('')}</ul>
      <p>${escapeHtml(summary.advice)}</p>`;
    summaryBox.hidden = false;
    restart.hidden = false;
    left.textContent = '';
  }

  /** The summary of the last finished conversation, shown again after a reload. */
  async function lastSummary(): Promise<boolean> {
    const user = await currentUser();
    if (!user) return false;
    const { data } = await supabase
      .from('lms_attempts')
      .select('passed, results')
      .eq('user_id', user.id)
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const attempt = data?.[0];
    if (!attempt?.results?.summary) return false;
    for (const m of (attempt.results.messages ?? []) as Message[]) chat.addMessage(bubble(m));
    showSummary(attempt.results.summary, attempt.passed);
    return true;
  }

  restart.addEventListener('click', () => {
    history = [];
    remember();
    done = false;
    chat.clearMessages(true);
    chat.disableSubmitButton(false);
    chat.setPlaceholderText('Twoje wyjaśnienie…');
    summaryBox.hidden = true;
    restart.hidden = true;
    canFinish();
    void greet();
  });

  finish.addEventListener('click', () => void summarize());

  chat.onComponentRender = () => {
    chat.onComponentRender = undefined;
    canFinish();
    if (history.length) return;
    // a moment later: Deep Chat wires up the "…" bubble only after this callback
    setTimeout(() => {
      void lastSummary().then((shown) => {
        if (!shown) void greet();
      });
    });
  };
  // after onComponentRender is set: the window may render as soon as it is on the page
  host.replaceChildren(chat);
}
