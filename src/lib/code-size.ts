// A− / A+ on the editor bars: one size of code for every editor and console on the site (CSS variable
// --code-size), remembered in this browser.
const SIZES = [12, 13, 14.5, 16, 18, 20, 22];
const DEFAULT = 14.5;
const KEY = 'kurs:code-size';

function saved(): number {
  try {
    const size = Number(localStorage.getItem(KEY));
    return SIZES.includes(size) ? size : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let size = saved();
const apply = () => document.documentElement.style.setProperty('--code-size', `${size}px`);
apply();

/** The two buttons; `onChange` lets an editor measure itself again. */
export function codeSizeButtons(onChange?: () => void): HTMLElement {
  const group = document.createElement('span');
  group.className = 'code-size';
  const button = (text: string, label: string, step: number) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      size = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + step))];
      try {
        localStorage.setItem(KEY, String(size));
      } catch {
        // private mode: the size lasts until the page is closed
      }
      apply();
      onChange?.();
    });
    return b;
  };
  group.append(button('A−', 'Mniejszy kod', -1), button('A+', 'Większy kod', 1));
  return group;
}
