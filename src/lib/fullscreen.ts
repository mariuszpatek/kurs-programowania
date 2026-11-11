// "Pełny ekran" for the editors: the class .fullscreen on `scope` turns its layout into a full-window one (CSS in
// Workspace.astro, task.astro and lesson-widgets.css), so nothing moves in the DOM and the editor keeps its
// state. Where the browser allows it, the page also goes really fullscreen. Esc or the button closes it.
let current: { scope: HTMLElement; changed: (on: boolean) => void } | null = null;

function close() {
  if (!current) return;
  const { scope, changed } = current;
  current = null;
  scope.classList.remove('fullscreen');
  document.documentElement.classList.remove('code-fullscreen');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  changed(false);
}

function open(scope: HTMLElement, changed: (on: boolean) => void) {
  close();
  current = { scope, changed };
  scope.classList.add('fullscreen');
  document.documentElement.classList.add('code-fullscreen');
  if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  changed(true);
}

// Esc in the browser's fullscreen leaves it without reaching the page; leave ours too
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) close();
});
// Esc without the browser's fullscreen (e.g. iPhone); not when the editor used it (closing its hints)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current && !e.defaultPrevented) close();
});

/** The button for the editor's bar. `onChange` runs after the layout switched (e.g. to measure the editor). */
export function fullscreenButton(scope: HTMLElement, onChange?: (on: boolean) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost fullscreen-toggle';
  const changed = (on: boolean) => {
    button.textContent = on ? 'Zamknij pełny ekran' : 'Pełny ekran';
    button.setAttribute('aria-pressed', String(on));
    onChange?.(on);
  };
  button.textContent = 'Pełny ekran';
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => (current?.scope === scope ? close() : open(scope, changed)));
  return button;
}

/** Closes the full screen, e.g. when its editor goes away. */
export const closeFullscreen = close;
