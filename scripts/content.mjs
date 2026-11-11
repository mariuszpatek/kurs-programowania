// Reading course folders, shared by sync-content.mjs, new-course.mjs and new-lesson.mjs.
//
// <content root>/                     default ../korepetycje_python/platforma (or CONTENT_DIR in .env)
//   <course>/course.yaml              slug, title, language, level, description, position? (step in the learning path)
//   <course>/tutor-prompt.md          prompt the student copies into their own AI chat ("Pomoc z AI" in a lesson);
//                                     {{topics}} = topics of lessons so far
//   <course>/assistant.md             note for the tutor at tasks (supabase/functions/assistant): who the students
//                                     are, what the tutor should know about the course; optional
//   <course>/lessons/01.md            frontmatter: number, title, topics
//   <course>/lessons/01.teacher.md    notes for the teacher only (plan, extra examples, answers); optional
//                                     "## @slug Title" sections show up at <!-- nauczyciel: slug --> in the lesson
//   <course>/lessons/img/name.svg     drawings; ![caption](img/name.svg) in a lesson is inlined (src/lib/diagrams.ts)
//   <course>/lessons/img/name.webp    pictures (memes, photos; webp/jpg/png, max 150 kB), inlined as data URIs
//   <course>/tasks/01/01-name.md      frontmatter: title, number, kind, in_class?, starter_code?, predict_code?, hints?
//                                     local: done on the student's computer, no tests; the student hands in a link or a description
//                                     hints: list of graded hints, the student opens them after failed checks
//                                     kind: code (default), predict, or choice: ```python blocks, each with a
//                                     quiz under it (src/lib/quiz.ts); no solution file
//                                     explain: "Wytłumacz koledze" chat (supabase/functions/explain); the .teacher.md
//                                     file is the key the friend asks by, so it is required
//                                     draft: true makes a new task a draft even in a published lesson
//   <course>/tasks/01/01-name.teacher.md  solution and explanation for the teacher only; optional
//
// Whether a lesson is published is not in these files: the teacher publishes it in the dashboard.
//   <course>/tasks/01/01-name.test.py tests
//   <course>/solutions/01/01-name.py  reference solution (.txt for predict tasks); 01-name.bad-*.py wrong ones
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const read = (path) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
export const readIfExists = (path) => (existsSync(path) ? read(path) : null);
export const listDir = (path) => (existsSync(path) ? readdirSync(path).sort() : []);
export const pad = (n) => String(n).padStart(2, '0');

export function loadEnv() {
  for (const line of (readIfExists(resolve(import.meta.dirname, '..', '.env')) ?? '').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export function contentRoot() {
  loadEnv();
  return resolve(import.meta.dirname, '..', process.env.CONTENT_DIR ?? '../korepetycje_python/platforma');
}

/** A course folder, or every course folder inside a content root. */
export function courseDirs(path) {
  if (existsSync(join(path, 'course.yaml'))) return [path];
  return listDir(path)
    .map((name) => join(path, name))
    .filter((dir) => existsSync(join(dir, 'course.yaml')));
}

export function frontmatter(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing frontmatter (--- ... ---)`);
  return { meta: parseYaml(match[1]) ?? {}, body: match[2].trim() };
}

/** Things a drawing must not contain: it lives inside the lesson page, next to other drawings. */
const DRAWING_RULES = [
  [/<script|\son\w+=/i, 'skryptów'],
  [/\sid=/, 'atrybutu id (kilka rysunków na jednej stronie by się gryzło)'],
  [/\s(fill|stroke|color)="(#|rgb|hsl)|style="[^"]*(fill|stroke|color)\s*:/i, 'własnych kolorów (tylko klasy .box, .str, .num … z lesson-widgets.css)'],
];

/** ![caption](img/name.svg) becomes the drawing itself, so it needs no hosting and follows the theme. */
function inlineDrawings(body, lessonsDir, file, used) {
  // [ \t]*, not \s*: \s would also swallow the empty line after the drawing and glue the next block to the HTML
  return body.replace(/^!\[([^\]]*)\]\((img\/[\w-]+\.svg)\)[ \t]*$/gm, (_, caption, path) => {
    const svg = readIfExists(join(lessonsDir, path));
    if (!svg) throw new Error(`${file}: no drawing ${path}`);
    for (const [pattern, what] of DRAWING_RULES) {
      if (pattern.test(svg)) throw new Error(`${path}: rysunek nie może mieć ${what}`);
    }
    used.add(basename(path));
    const alt = caption.replace(/"/g, '&quot;');
    // an HTML block in Markdown ends at the first empty line, so the drawing must have none
    const drawing = svg.replace(/<\?xml[^>]*>/, '').trim().replace(/\n\s*\n/g, '\n');
    return `<figure class="diagram" data-alt="${alt}">\n${drawing}\n<figcaption>${caption}</figcaption>\n</figure>`;
  });
}

const PICTURE_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const MAX_PICTURE_BYTES = 150_000;

/** ![caption](img/name.webp|jpg|png), e.g. a meme, goes into the lesson as a data URI, so it needs no hosting either. */
function inlinePictures(body, lessonsDir, file, used) {
  return body.replace(/^!\[([^\]]*)\]\((img\/[\w-]+\.(webp|jpe?g|png))\)[ \t]*$/gm, (_, caption, path, ext) => {
    const full = join(lessonsDir, path);
    if (!existsSync(full)) throw new Error(`${file}: no picture ${path}`);
    const bytes = readFileSync(full);
    if (bytes.length > MAX_PICTURE_BYTES) throw new Error(`${path}: obrazek ma ${Math.round(bytes.length / 1000)} kB, najwyżej ${MAX_PICTURE_BYTES / 1000} kB (zmniejsz go albo zapisz jako webp)`);
    used.add(basename(path));
    return `![${caption}](data:${PICTURE_TYPES[ext]};base64,${bytes.toString('base64')})`;
  });
}

export function loadCourse(dir) {
  const course = parseYaml(read(join(dir, 'course.yaml')));
  for (const field of ['slug', 'title', 'language']) {
    if (!course[field]) throw new Error(`${join(dir, 'course.yaml')}: missing ${field}`);
  }
  course.tutor_prompt = readIfExists(join(dir, 'tutor-prompt.md'))?.trim() ?? '';
  course.assistant_notes = readIfExists(join(dir, 'assistant.md'))?.trim() ?? '';

  const usedDrawings = new Set();
  const lessons = listDir(join(dir, 'lessons'))
    .filter((f) => f.endsWith('.md') && !f.endsWith('.teacher.md'))
    .map((f) => {
      const { meta, body } = frontmatter(read(join(dir, 'lessons', f)), f);
      // an unquoted topic with ": " inside ("and: oba warunki") is read by YAML as a key and a value
      const topics = meta.topics ?? [];
      if (!Array.isArray(topics) || topics.some((t) => typeof t !== 'string' || !t.trim())) {
        throw new Error(`${f}: topics must be a list of non-empty texts (put a topic with ": " in quotes)`);
      }
      return { number: meta.number, title: meta.title, topics, body_md: inlinePictures(inlineDrawings(body, join(dir, 'lessons'), f, usedDrawings), join(dir, 'lessons'), f, usedDrawings) };
    });

  // lessons/01.teacher.md belongs to the lesson whose file is lessons/01.md
  const teacherNotes = listDir(join(dir, 'lessons'))
    .filter((f) => f.endsWith('.teacher.md'))
    .map((f) => {
      const lesson = lessons.find((l) => pad(l.number) === f.slice(0, -'.teacher.md'.length));
      if (!lesson) throw new Error(`${f}: no lesson with this number`);
      return { lesson_number: lesson.number, body_md: read(join(dir, 'lessons', f)).trim() };
    });

  const tasks = [];
  for (const lessonFolder of listDir(join(dir, 'tasks'))) {
    const solutionsDir = join(dir, 'solutions', lessonFolder);
    for (const f of listDir(join(dir, 'tasks', lessonFolder)).filter((f) => f.endsWith('.md') && !f.endsWith('.teacher.md'))) {
      const name = basename(f, '.md');
      const { meta, body } = frontmatter(read(join(dir, 'tasks', lessonFolder, f)), f);
      const kind = meta.kind ?? 'code';
      if (!['code', 'predict', 'local', 'choice', 'explain'].includes(kind)) throw new Error(`${f}: kind must be code, predict, local, choice or explain`);
      const hints = meta.hints ?? [];
      if (!Array.isArray(hints) || hints.some((h) => typeof h !== 'string' || !h.trim())) {
        throw new Error(`${f}: hints must be a list of non-empty texts`);
      }
      tasks.push({
        lesson_number: Number(lessonFolder),
        number: meta.number,
        slug: `${lessonFolder}-${name}`,
        title: meta.title,
        kind,
        body_md: body,
        starter_code: meta.starter_code ?? '',
        predict_code: meta.predict_code ?? '',
        tests: readIfExists(join(dir, 'tasks', lessonFolder, `${name}.test.py`)) ?? '',
        in_class: Boolean(meta.in_class),
        // a new task starts as a draft also in a published lesson (the teacher publishes it later)
        start_as_draft: Boolean(meta.draft),
        hints: hints.map((h) => h.trim()),
        // uploaded to lms_task_notes (teachers only), not to lms_tasks
        teacher_notes: readIfExists(join(dir, 'tasks', lessonFolder, `${name}.teacher.md`))?.trim() ?? '',
        // validation only, never uploaded
        solution: readIfExists(join(solutionsDir, `${name}.${kind === 'predict' ? 'txt' : 'py'}`)),
        bad: listDir(solutionsDir)
          .filter((s) => s.startsWith(`${name}.bad-`))
          .map((s) => ({ name: s.slice(name.length + 5).replace(/\.[^.]+$/, ''), code: read(join(solutionsDir, s)) })),
      });
    }
  }
  const unusedDrawings = listDir(join(dir, 'lessons', 'img')).filter((f) => /\.(svg|webp|jpe?g|png)$/.test(f) && !usedDrawings.has(f));
  return { dir, course, lessons, tasks, teacherNotes, unusedDrawings };
}
