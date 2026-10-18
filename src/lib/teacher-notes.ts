// Teacher notes (lessons/NN.teacher.md) can be pinned to a spot in the lesson, so the teacher sees
// "mention this here" right next to the example it is about:
//
//   lessons/02.md            <!-- nauczyciel: rzutowanie -->
//   lessons/02.teacher.md    ## @rzutowanie Co omówić przy rzutowaniu
//                            ...everything up to the next "## " heading...
//
// The marker is an HTML comment, so students (who never get the notes, RLS) see nothing.
// Notes without a marker in the lesson stay in the box at the top of the page.
import { renderMarkdown, enhanceCodeBlocks } from './markdown';

export type InlineNote = { slug: string; title: string; body: string };

const NOTE_HEADING = /^## @([\w-]+)[ \t]*(.*)$/;
const MARKER = /^\s*nauczyciel:\s*([\w-]+)\s*$/;
const MARKER_LINE = /^[ \t]*<!--\s*nauczyciel:\s*[\w-]+\s*-->[ \t]*\n?/gm;

/** Splits notes into the general part and the sections pinned to lesson markers. */
export function splitTeacherNotes(md: string): { general: string; inline: InlineNote[] } {
  const general: string[] = [];
  const inline: InlineNote[] = [];
  let current: { slug: string; title: string; lines: string[] } | null = null;
  let inFence = false;
  const close = () => {
    if (current) inline.push({ slug: current.slug, title: current.title, body: current.lines.join('\n').trim() });
    current = null;
  };
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = inFence ? null : line.match(NOTE_HEADING);
    if (heading) {
      close();
      current = { slug: heading[1], title: heading[2].trim(), lines: [] };
      continue;
    }
    if (!inFence && current && /^#{1,2} /.test(line)) close();
    (current ? current.lines : general).push(line);
  }
  close();
  return { general: general.join('\n').trim(), inline };
}

function noteBox(note: InlineNote): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'teacher-notes teacher-inline';
  const summary = document.createElement('summary');
  summary.append(note.title || 'Dla nauczyciela');
  const badge = document.createElement('span');
  badge.className = 'teacher-only';
  badge.textContent = 'tylko Ty to widzisz';
  summary.append(badge);
  const body = document.createElement('div');
  body.className = 'prose teacher-notes-body';
  body.innerHTML = renderMarkdown(note.body);
  enhanceCodeBlocks(body);
  details.append(summary, body);
  return details;
}

/** Replaces lesson markers with collapsible notes. Returns the notes whose marker is not in the lesson. */
export function mountInlineNotes(root: HTMLElement, notes: InlineNote[]): InlineNote[] {
  const markers = new Map<string, Comment>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    const slug = comment.data.match(MARKER)?.[1];
    if (slug) markers.set(slug, comment);
  }
  const unplaced: InlineNote[] = [];
  for (const note of notes) {
    const marker = markers.get(note.slug);
    if (marker) marker.replaceWith(noteBox(note));
    else unplaced.push(note);
  }
  return unplaced;
}

/** Inline notes back as ordinary sections, for places that show the notes on their own (dashboard, top box). */
export function notesAsMarkdown(general: string, inline: InlineNote[]): string {
  return [general, ...inline.map((n) => `## ${n.title || 'Dla nauczyciela'}\n\n${n.body}`)].filter(Boolean).join('\n\n');
}

/** Lesson Markdown without the teacher markers (for the student's "copy lesson" export). */
export function stripTeacherMarkers(md: string): string {
  return md.replace(MARKER_LINE, '');
}
