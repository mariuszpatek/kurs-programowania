// Lesson and task text comes from the database as Markdown and is rendered in the browser.
// Only the teacher writes content (via the sync script), so the generated HTML is trusted.
//
// Code fences in lesson Markdown:
//   ```python   code: highlighted, with a language caption and a Copy button
//   ```output   what the program prints: console style
//   ```error    an error message: console style in red
//   ```         plain text (e.g. a prompt to copy): with a Copy button
// A code block directly followed by an output/error block is shown as one "code → result" card.
import { Marked } from 'marked';
import { languageByFence } from './languages';
import { escapeHtml } from './languages/highlight';

const CONSOLE_FENCES: Record<string, { className: string; caption: string }> = {
  output: { className: 'output', caption: 'Wynik' },
  error: { className: 'output error', caption: 'Błąd' },
};

function codeFigure(text: string, fence: string): string {
  const consoleKind = CONSOLE_FENCES[fence];
  if (consoleKind) {
    return `<figure class="code-block ${consoleKind.className}"><figcaption>${consoleKind.caption}</figcaption><pre>${escapeHtml(text)}</pre></figure>`;
  }
  const language = languageByFence(fence);
  const body = language ? language.highlight(text) : escapeHtml(text);
  const caption = language?.label ?? (fence ? escapeHtml(fence) : 'Tekst');
  return `<figure class="code-block copyable"><figcaption>${caption}</figcaption><pre><code>${body}</code></pre></figure>`;
}

const marked = new Marked({
  renderer: {
    code({ text, lang }) {
      return codeFigure(text, (lang ?? '').trim().split(/\s+/)[0]);
    },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false });
}

/** For text written by the AI: Markdown formatting, but no raw HTML. */
export function renderUntrustedMarkdown(md: string): string {
  return marked.parse(escapeHtml(md), { async: false });
}

/** Adds Copy buttons and joins code with the output block right after it. Call after inserting rendered HTML. */
export function enhanceCodeBlocks(root: HTMLElement) {
  for (const figure of root.querySelectorAll<HTMLElement>('figure.code-block.copyable')) {
    const next = figure.nextElementSibling;
    if (next?.matches('figure.code-block.output')) {
      const pair = document.createElement('div');
      pair.className = 'code-pair';
      figure.replaceWith(pair);
      pair.append(figure, next);
    }
    const button = document.createElement('button');
    button.className = 'copy ghost';
    button.type = 'button';
    button.textContent = 'Kopiuj';
    button.addEventListener('click', async () => {
      const pre = figure.querySelector('pre')!;
      try {
        await navigator.clipboard.writeText(pre.textContent ?? '');
        button.textContent = 'Skopiowano';
      } catch {
        getSelection()?.selectAllChildren(pre);
        button.textContent = 'Zaznaczono, naciśnij Ctrl+C';
      }
      setTimeout(() => (button.textContent = 'Kopiuj'), 2000);
    });
    figure.querySelector('figcaption')!.append(button);
  }
}
