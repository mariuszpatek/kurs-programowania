// Markdown written by the AI (assistant, "Wytłumacz koledze"): formatting and code, but raw HTML is shown
// as text and links lead only to http(s). Escaping the text before parsing instead would escape code twice
// (`a < 3` showed as `a &lt; 3`).
import { Marked } from 'marked';
import { escapeHtml } from './languages/highlight';

const untrusted = new Marked({
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      return /^https?:\/\//.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${text}</a>` : text;
    },
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

export function renderUntrustedMarkdown(md: string): string {
  return untrusted.parse(md, { async: false });
}
