// The chat window shared by Robcio ("Wytłumacz koledze", explain.ts) and Kodek (the tutor at tasks,
// assistant.ts): Deep Chat styled like the site. Callers load it with `await import('deep-chat')` first, so
// pages without a chat don't download it.
import type { DeepChat } from 'deep-chat';
import { renderUntrustedMarkdown } from './markdown';

export type Message = { role: 'user' | 'assistant'; content: string };

/** A saved message as a Deep Chat bubble; the model's text is Markdown from outside, so it is rendered safely. */
export const bubble = (m: Message) =>
  m.role === 'user' ? { role: 'user', text: m.content } : { role: 'ai', html: renderUntrustedMarkdown(m.content) };

/** Messages read back from storage; one without text (left by an older version) would break the whole chat. */
export function savedMessages(raw: string | null): Message[] {
  try {
    const saved = JSON.parse(raw ?? '[]');
    return Array.isArray(saved) ? saved.filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string') : [];
  } catch {
    return [];
  }
}

/** Deep Chat styled with the site's colours (CSS variables reach into its shadow DOM). */
export function createChat(options: { name: string; placeholder: string; height: string; characterLimit: number }): DeepChat {
  const chat = document.createElement('deep-chat') as DeepChat;
  chat.style.display = 'block';
  chat.style.width = '100%';
  chat.chatStyle = {
    width: '100%',
    height: options.height,
    border: '1px solid var(--line)',
    borderRadius: '12px',
    backgroundColor: 'var(--surface)',
    fontFamily: 'inherit',
    fontSize: '15px',
  };
  // waiting for the answer looks like the site's loading (.loading in global.css): "kodek.myśli()" typed in, then
  // a blinking cursor; the bubble is as tall as a one-line message, so it stays in line with the name
  const who = options.name.toLowerCase();
  const thinking = `<span class="thinking"><span class="typed" style="animation-timing-function: steps(${who.length + 8}, end)">${who}.<span class="fn">myśli</span>()</span></span>`;
  chat.messageStyles = {
    default: {
      shared: { bubble: { maxWidth: '85%', lineHeight: '1.5', padding: '8px 12px' } },
      user: { bubble: { backgroundColor: 'var(--accent)', color: '#fff' } },
      ai: { bubble: { backgroundColor: 'var(--surface-2)', color: 'var(--text)' } },
    },
    html: { shared: { bubble: { maxWidth: '85%', lineHeight: '1.5', padding: '8px 12px' } }, ai: { bubble: { backgroundColor: 'var(--surface-2)', color: 'var(--text)' } } },
    error: { bubble: { backgroundColor: 'var(--bad-bg)', color: 'var(--bad)' } },
    loading: { message: { html: thinking, styles: { bubble: { backgroundColor: 'var(--surface-2)', padding: '8px 12px', lineHeight: '1.5' } } } },
  };
  chat.names = { ai: { text: options.name, style: { color: 'var(--text-2)' } }, user: { text: 'Ty', style: { color: 'var(--text-2)' } } };
  chat.textInput = {
    placeholder: { text: options.placeholder },
    characterLimit: options.characterLimit,
    styles: {
      container: { backgroundColor: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: '10px', width: '90%' },
      text: { color: 'var(--text)', padding: '8px 10px' },
    },
  };
  chat.errorMessages = { displayServiceErrorMessages: true };
  chat.auxiliaryStyle = `
    .thinking { display: flex; align-items: center; height: 22.5px; font-family: var(--mono); font-size: 14px; color: var(--text-2); }
    .thinking::after { content: ''; width: 0.6em; height: 1.15em; margin-left: 1px; background: var(--accent); animation: thinking-cursor 1s steps(1) infinite; }
    .thinking .typed { white-space: nowrap; clip-path: inset(0 100% 0 0); animation: thinking-type 0.8s 0.1s forwards; }
    .thinking .fn { color: var(--code-function); }
    @keyframes thinking-type { to { clip-path: inset(0 0 0 0); } }
    @keyframes thinking-cursor { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .thinking::after, .thinking .typed { animation: none; clip-path: none; } }
  `;
  // the waiting bubble is switched by hand (Deep Chat replaces toggle when it renders), so it also shows while
  // the bot writes a message nobody asked for (Robcio's greeting), which Deep Chat itself does not do
  chat.displayLoadingBubble = { toggle: () => {} };
  return chat;
}

const typingShown = new WeakSet<DeepChat>();

/** Shows or hides the waiting bubble ("kodek.myśli()"). Deep Chat's toggle() adds another one when it is not the last
 * bubble, so it is called only when the state really changes and nothing else is added in between. */
export const typing = (chat: DeepChat, on: boolean) => {
  const dots = chat.displayLoadingBubble;
  if (typeof dots !== 'object' || on === typingShown.has(chat)) return;
  if (on) typingShown.add(chat);
  else typingShown.delete(chat);
  dots.toggle(on ? { role: 'ai' } : undefined);
};
