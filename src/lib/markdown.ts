// Lesson and task text comes from the database as Markdown and is rendered in the browser.
// Only the teacher writes content (via the sync script), so the generated HTML is trusted.
//
// Code fences in lesson Markdown:
//   ```python   code: highlighted, with a language caption and a Copy button
//   ```output   what the program prints: console style
//   ```error    an error message: console style in red
//   ```         plain text (e.g. a prompt to copy): with a Copy button
//   ```python krok        code with a "Krok po kroku" button (src/lib/stepper.ts);
//   ```python krok 16 Ola  words after "krok" are the answers for input()
// A code block directly followed by an output/error block is shown as one "code → result" card.
//
// Callouts use GitHub's alert syntax:
//   > [!WARNING]              > [!TIP]                  > [!NOTE]
//   > Zaznacz „Add to PATH”.  > Skrót: Ctrl+Enter.      > Na stronie input() czyta z pola.
import { Marked } from 'marked';
import { languageByFence } from './languages';
import { escapeHtml } from './languages/highlight';
import { mountStepper } from './stepper';

const CONSOLE_FENCES: Record<string, { className: string; caption: string }> = {
  output: { className: 'output', caption: 'Wynik' },
  error: { className: 'output error', caption: 'Błąd' },
};

function codeFigure(text: string, fence: string, flags: string[] = []): string {
  const consoleKind = CONSOLE_FENCES[fence];
  if (consoleKind) {
    return `<figure class="code-block ${consoleKind.className}"><figcaption>${consoleKind.caption}</figcaption><pre>${escapeHtml(text)}</pre></figure>`;
  }
  const language = languageByFence(fence);
  const body = language ? language.highlight(text) : escapeHtml(text);
  const caption = language?.label ?? (fence ? escapeHtml(fence) : 'Tekst');
  const steppable = flags[0] === 'krok' && language?.runner?.trace;
  const attrs = steppable ? ` data-fence="${escapeHtml(fence)}" data-stdin="${escapeHtml(flags.slice(1).join('\n'))}"` : '';
  return `<figure class="code-block copyable${steppable ? ' steppable' : ''}"${attrs}><figcaption>${caption}</figcaption><pre><code>${body}</code></pre></figure>`;
}

const CALLOUTS: Record<string, string> = {
  NOTE: 'Dobrze wiedzieć',
  TIP: 'Wskazówka',
  IMPORTANT: 'Ważne',
  WARNING: 'Uwaga',
  CAUTION: 'Uwaga',
};

const marked = new Marked({
  renderer: {
    blockquote({ tokens }) {
      const html = this.parser.parse(tokens);
      const match = html.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
      if (!match) return `<blockquote>${html}</blockquote>`;
      const kind = match[1];
      const body = `<p>${html.slice(match[0].length)}`.replace(/^<p><\/p>\s*/, '');
      return `<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${CALLOUTS[kind]}</p>${body}</aside>`;
    },
    code({ text, lang }) {
      const [fence = '', ...flags] = (lang ?? '').trim().split(/\s+/);
      return codeFigure(text, fence, flags);
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
    if (figure.matches('.steppable')) addStepButton(figure);
  }
}

function addStepButton(figure: HTMLElement) {
  const language = languageByFence(figure.dataset.fence ?? '')!;
  const button = document.createElement('button');
  button.className = 'step ghost';
  button.type = 'button';
  button.textContent = 'Krok po kroku';
  let player: HTMLElement | null = null;
  const pair = figure.closest<HTMLElement>('.code-pair');
  // while the steps are open the player shows the code, so the plain listing (and its output) steps aside
  const listing = [figure.querySelector('pre')!, ...(pair ? [pair.querySelector<HTMLElement>('.code-block.output')!] : [])];
  button.addEventListener('click', () => {
    if (player) {
      player.hidden = !player.hidden;
    } else {
      const source = figure.querySelector('pre')!.textContent ?? '';
      player = mountStepper(pair ?? figure, source, language, figure.dataset.stdin ?? '');
    }
    for (const part of listing) part.hidden = !player.hidden;
    button.textContent = player.hidden ? 'Krok po kroku' : 'Ukryj kroki';
  });
  figure.querySelector('figcaption .copy')!.before(button);
}
