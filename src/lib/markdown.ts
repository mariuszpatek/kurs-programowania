// Lesson and task text comes from the database as Markdown and is rendered in the browser.
// Only the teacher can write content (via the sync script), so the HTML is trusted.
import { Marked } from 'marked';
import { highlightCode, classHighlighter } from '@lezer/highlight';
import { parser as pythonParser } from '@lezer/python';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlightPython(code: string): string {
  let html = '';
  highlightCode(
    code,
    pythonParser.parse(code),
    classHighlighter,
    (text, classes) => (html += classes ? `<span class="${classes}">${escape(text)}</span>` : escape(text)),
    () => (html += '\n'),
  );
  return html;
}

const marked = new Marked({
  renderer: {
    code({ text, lang }) {
      const body = lang === 'python' || lang === 'py' ? highlightPython(text) : escape(text);
      return `<pre><code>${body}</code></pre>`;
    },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      return `<a href="${escape(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false });
}

/** For text written by the AI: Markdown formatting, but no raw HTML. */
export function renderUntrustedMarkdown(md: string): string {
  return marked.parse(escape(md), { async: false });
}
