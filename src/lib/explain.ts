// "Wytłumacz koledze" (beta): wires up components/Explain.astro. The conversation goes through the edge function
// `explain`, which also saves the attempt with the summary; this browser only remembers the unfinished chat,
// and a finished one comes back from that attempt.
import { supabase, currentUser } from './supabase';
import { renderUntrustedMarkdown } from './markdown';
import { escapeHtml } from './languages/highlight';

type Message = { role: 'user' | 'assistant'; content: string };
type Summary = { concepts: { name: string; verdict: 'umie' | 'czesciowo' | 'nie'; comment: string }[]; advice: string };

const VERDICT = { umie: '✓ umiesz', czesciowo: '~ częściowo', nie: '✗ jeszcze nie' };

export function mountExplain(root: HTMLElement, task: { id: string }) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const chat = $('.chat');
  const form = $<HTMLFormElement>('form');
  const input = $<HTMLTextAreaElement>('textarea');
  const send = $<HTMLButtonElement>('.send');
  const finish = $<HTMLButtonElement>('.finish');
  const left = $('.left');
  const summaryBox = $('.summary');
  const restart = $<HTMLButtonElement>('.restart');
  const storageKey = `kurs:explain:${task.id}`;
  root.hidden = false;

  let history: Message[] = [];
  try {
    history = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
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

  const append = (m: Message, error = false) => {
    const div = document.createElement('div');
    div.className = `message ${m.role === 'user' ? 'user' : 'friend'}${error ? ' error' : ''}`;
    if (m.role === 'assistant') div.innerHTML = renderUntrustedMarkdown(m.content);
    else div.textContent = m.content;
    chat.append(div);
    div.scrollIntoView({ block: 'nearest' });
    return div;
  };

  const busy = (on: boolean) => {
    send.disabled = on;
    finish.disabled = on || !history.some((m) => m.role === 'user');
  };

  async function call(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('explain', { body: { taskId: task.id, ...body } });
    if (!error) return data;
    const message = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null);
    append({ role: 'assistant', content: `⚠️ ${message ?? 'Kuba nie odpowiada. Spróbuj za chwilę.'}` }, true);
    return null;
  }

  async function reply() {
    busy(true);
    const waiting = append({ role: 'assistant', content: '…' });
    const data = await call({ messages: history });
    waiting.remove();
    if (data?.reply) {
      history.push({ role: 'assistant', content: data.reply });
      append(history.at(-1)!);
      remember();
      left.textContent = data.left > 0 ? `Zostało wiadomości: ${data.left}` : '';
      if (data.left <= 0) return summarize();
    }
    busy(false);
  }

  async function summarize() {
    busy(true);
    finish.textContent = 'Podsumowuję…';
    const data = await call({ messages: history, finish: true });
    finish.textContent = 'Zakończ i podsumuj';
    if (!data?.summary) return busy(false);
    // the conversation is saved with the attempt now, so this browser can forget it
    history = [];
    remember();
    showSummary(data.summary, data.passed);
    window.dispatchEvent(new CustomEvent('kurs:attempt', { detail: { taskId: task.id, passed: data.passed } }));
  }

  function showSummary(summary: Summary, passed: boolean) {
    form.hidden = true;
    summaryBox.innerHTML = `<p class="eyebrow">Podsumowanie</p>
      <p><strong>${passed ? 'Zaliczone. Umiesz to wytłumaczyć.' : 'Jeszcze nie wszystko. Powtórz i spróbuj znowu.'}</strong></p>
      <ul>${summary.concepts
        .map((c) => `<li><span class="verdict-${c.verdict}">${VERDICT[c.verdict] ?? ''}</span> <strong>${escapeHtml(c.name)}</strong>: ${escapeHtml(c.comment)}</li>`)
        .join('')}</ul>
      <p>${escapeHtml(summary.advice)}</p>`;
    summaryBox.hidden = false;
    restart.hidden = false;
  }

  restart.addEventListener('click', () => {
    history = [];
    remember();
    chat.replaceChildren();
    summaryBox.hidden = true;
    restart.hidden = true;
    form.hidden = false;
    left.textContent = '';
    void reply();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    history.push({ role: 'user', content: text });
    append(history.at(-1)!);
    remember();
    void reply();
  });

  finish.addEventListener('click', () => void summarize());

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
    for (const m of (attempt.results.messages ?? []) as Message[]) append(m);
    showSummary(attempt.results.summary, attempt.passed);
    return true;
  }

  history.forEach((m) => append(m));
  if (history.length) busy(false);
  else
    void lastSummary().then((shown) => {
      if (!shown) void reply();
    });
}
