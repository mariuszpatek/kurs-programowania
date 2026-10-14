// Turns a rendered lesson into numbered sections and builds the table of contents for it.

export type OutlineItem = { id: string; title: string; number: string };

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Wraps every `h2` and the content after it in a <section>, numbered 01, 02, … */
export function splitIntoSections(root: HTMLElement): OutlineItem[] {
  const items: OutlineItem[] = [];
  const used = new Set<string>();
  let current: HTMLElement | null = null;
  for (const node of [...root.childNodes]) {
    if (node instanceof HTMLHeadingElement && node.tagName === 'H2') {
      const title = node.textContent ?? '';
      let id = slugify(title) || `sekcja-${items.length + 1}`;
      while (used.has(id)) id += '-';
      used.add(id);
      const number = String(items.length + 1).padStart(2, '0');
      items.push({ id, title, number });

      current = document.createElement('section');
      current.className = 'lesson-section';
      current.id = id;
      node.prepend(Object.assign(document.createElement('span'), { className: 'section-number', textContent: number }));
      root.insertBefore(current, node);
    }
    current?.append(node);
  }
  return items;
}

/** Fills every list with the outline and highlights the section currently being read. */
export function mountOutline(lists: HTMLOListElement[], items: OutlineItem[], extra: { id: string; title: string }[] = []) {
  for (const list of lists) {
    list.replaceChildren(
      ...[...items, ...extra].map((item) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${item.id}`;
        a.dataset.target = item.id;
        if ('number' in item) a.append(Object.assign(document.createElement('span'), { className: 'toc-number', textContent: item.number }));
        a.append(item.title);
        li.append(a);
        return li;
      }),
    );
  }

  const links = lists.flatMap((l) => [...l.querySelectorAll<HTMLAnchorElement>('a')]);
  const visible = new Set<string>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
      // the first section (in page order) that is on screen is the one being read
      const active = [...items, ...extra].find((i) => visible.has(i.id))?.id;
      for (const a of links) a.classList.toggle('active', a.dataset.target === active);
    },
    { rootMargin: '-80px 0px -55% 0px' },
  );
  for (const item of [...items, ...extra]) {
    const target = document.getElementById(item.id);
    if (target) observer.observe(target);
  }
}

/** Rough reading time of the lesson text, in minutes. */
export function readingMinutes(root: HTMLElement): number {
  const words = (root.textContent ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}
