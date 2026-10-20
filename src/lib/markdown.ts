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
//   ```python błąd         a syntax error shown on purpose (sync-content does not try to compile it)
// In lessons every example in a language that runs in the browser also gets "Zmień i uruchom"
// (src/lib/playground.ts): the example opens as an editor in place.
// A code block directly followed by an output/error block is shown as one "code → result" card.
//
// Links are marked by where they lead, with no extra syntax: a paragraph with a video link
// (YouTube, Vimeo) becomes a "Do obejrzenia" card so it does not get lost, and a link to
// documentation gets a small book icon.
//
// Callouts use GitHub's alert syntax:
//   > [!WARNING]              > [!TIP]                  > [!NOTE]
//   > Zaznacz „Add to PATH”.  > Skrót: Ctrl+Enter.      > Na stronie input() czyta z pola.
import { Marked } from 'marked';
import { languageByFence } from './languages';
import { escapeHtml } from './languages/highlight';
import { mountStepper } from './stepper';
import { mountDiagrams } from './diagrams';

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
  const runnable = Boolean(language?.runner);
  const stdin = flags[0] === 'krok' ? flags.slice(1).join('\n') : '';
  const attrs = runnable ? ` data-fence="${escapeHtml(fence)}" data-stdin="${escapeHtml(stdin)}"` : '';
  const classes = `${runnable ? ' runnable' : ''}${steppable ? ' steppable' : ''}`;
  return `<figure class="code-block copyable${classes}"${attrs}><figcaption>${caption}</figcaption><pre><code>${body}</code></pre></figure>`;
}

const CALLOUTS: Record<string, string> = {
  NOTE: 'Dobrze wiedzieć',
  TIP: 'Wskazówka',
  IMPORTANT: 'Ważne',
  WARNING: 'Uwaga',
  CAUTION: 'Uwaga',
};

const VIDEO = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|vimeo\.com\/)/;
const DOCS = /^https?:\/\/(docs\.python\.org|developer\.mozilla\.org|learn\.microsoft\.com)\//;

type InlineToken = { type: string; href?: string; tokens?: InlineToken[] };
const hasVideo = (tokens: InlineToken[] = []): boolean =>
  tokens.some((t) => (t.type === 'link' && VIDEO.test(t.href ?? '')) || hasVideo(t.tokens));

const marked = new Marked({
  renderer: {
    paragraph({ tokens }) {
      const html = this.parser.parseInline(tokens);
      if (!hasVideo(tokens as InlineToken[])) return `<p>${html}</p>\n`;
      return `<aside class="video-card"><span class="video-play" aria-hidden="true"></span><div><p class="callout-title">Do obejrzenia</p><p>${html}</p></div></aside>\n`;
    },
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
      const kind = VIDEO.test(href) ? ' class="video-link"' : DOCS.test(href) ? ' class="doc-link"' : '';
      return `<a href="${escapeHtml(href)}"${kind}${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
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

/** Adds Copy buttons, joins code with the output block right after it and adds step controls to drawings.
 * With `playground`, runnable examples also get "Zmień i uruchom" (lessons only). Call after inserting rendered HTML. */
export function enhanceContent(root: HTMLElement, { playground = false } = {}) {
  mountDiagrams(root);
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
    if (playground && figure.matches('.runnable')) addEditButton(figure);
  }
}

function addEditButton(figure: HTMLElement) {
  const language = languageByFence(figure.dataset.fence ?? '')!;
  const button = document.createElement('button');
  button.className = 'edit ghost';
  button.type = 'button';
  button.textContent = 'Zmień i uruchom';
  const listing = figure.closest<HTMLElement>('.code-pair') ?? figure;
  button.addEventListener('click', async () => {
    // the steps of the original example would be out of date next to the changed code
    const stepButton = figure.querySelector<HTMLButtonElement>('figcaption .step');
    if (stepButton?.textContent === 'Ukryj kroki') stepButton.click();
    const { mountPlayground } = await import('./playground');
    const source = figure.querySelector('pre')!.textContent ?? '';
    mountPlayground(listing, source, language, figure.dataset.stdin ?? '', () => button.focus());
  });
  figure.querySelector('figcaption')!.firstElementChild!.before(button);
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
