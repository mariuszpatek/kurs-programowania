// Lesson Markdown as plain text, for the "copy lesson" export on the lesson page and for Bajtek (the assistant at
// lesson notes, lesson-assistant/). Pure functions with no imports, so both the site (src/lib re-exports them) and
// the edge functions use the same code.

const TEACHER_MARKER_LINE = /^[ \t]*<!--\s*nauczyciel:\s*[\w-]+\s*-->[ \t]*\n?/gm;
const TASK_MARKER_LINE = /^[ \t]*<!--\s*zadanie:\s*(\d+(?:\s*,\s*\d+)*)\s*-->[ \t]*$/gm;

/** Lesson Markdown without the teacher markers (<!-- nauczyciel: slug -->). */
export function stripTeacherMarkers(md: string): string {
  return md.replace(TEACHER_MARKER_LINE, '');
}

/** Lesson Markdown with each drawing replaced by its caption. */
export function drawingsAsText(md: string): string {
  return md.replace(/<figure class="diagram" data-alt="([^"]*)">[\s\S]*?<\/figure>/g, (_, alt: string) => `[Rysunek: ${alt.replace(/&quot;/g, '"')}]`);
}

/** "Sprawdź się" markers (<!-- zadanie: 3, 4 -->) as plain text: "Sprawdź się: zadanie 3 (Tytuł)". */
export function taskChecksAsText(md: string, tasks: { number: number; title: string }[]): string {
  return md.replace(TASK_MARKER_LINE, (_, list: string) => {
    const linked = list
      .split(',')
      .map((n) => tasks.find((t) => t.number === Number(n.trim())))
      .filter((t): t is { number: number; title: string } => Boolean(t));
    return linked.length ? `**Sprawdź się:** ${linked.map((t) => `zadanie ${t.number} (${t.title})`).join(', ')}` : '';
  });
}

/** Removes the answer key from closed questions: "- [x] 27" plus its indented explanation becomes "- 27". */
export function withoutAnswers(md: string): string {
  const out: string[] = [];
  let itemIndent = -1;
  for (const line of md.split('\n')) {
    const item = line.match(/^(\s*)[-*] \[[ xX]\] (.*)$/);
    if (item) {
      itemIndent = item[1].length;
      out.push(`${item[1]}- ${item[2]}`);
      continue;
    }
    const indent = line.match(/^\s*/)![0].length;
    if (itemIndent >= 0 && line.trim() && indent > itemIndent) continue;
    if (line.trim()) itemIndent = -1;
    out.push(line);
  }
  return out.join('\n');
}
