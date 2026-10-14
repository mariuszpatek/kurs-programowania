// Reading course folders, shared by sync-content.mjs, new-course.mjs and new-lesson.mjs.
//
// <content root>/                     default ../korepetycje_python/platforma (or CONTENT_DIR in .env)
//   <course>/course.yaml              slug, title, language, level, description
//   <course>/tutor-prompt.md          AI tutor prompt; {{topics}} = topics of lessons so far
//   <course>/lessons/01.md            frontmatter: number, title, topics, draft?
//   <course>/lessons/01.teacher.md    notes for the teacher only (plan, extra examples, answers); optional
//   <course>/tasks/01/01-name.md      frontmatter: title, number, kind, in_class?, starter_code?, predict_code?, draft?
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

export function loadCourse(dir) {
  const course = parseYaml(read(join(dir, 'course.yaml')));
  for (const field of ['slug', 'title', 'language']) {
    if (!course[field]) throw new Error(`${join(dir, 'course.yaml')}: missing ${field}`);
  }
  course.tutor_prompt = readIfExists(join(dir, 'tutor-prompt.md'))?.trim() ?? '';

  const lessons = listDir(join(dir, 'lessons'))
    .filter((f) => f.endsWith('.md') && !f.endsWith('.teacher.md'))
    .map((f) => {
      const { meta, body } = frontmatter(read(join(dir, 'lessons', f)), f);
      return { number: meta.number, title: meta.title, topics: meta.topics ?? [], body_md: body, draft: Boolean(meta.draft) };
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
    for (const f of listDir(join(dir, 'tasks', lessonFolder)).filter((f) => f.endsWith('.md'))) {
      const name = basename(f, '.md');
      const { meta, body } = frontmatter(read(join(dir, 'tasks', lessonFolder, f)), f);
      const kind = meta.kind ?? 'code';
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
        draft: Boolean(meta.draft),
        // validation only, never uploaded
        solution: readIfExists(join(solutionsDir, `${name}.${kind === 'predict' ? 'txt' : 'py'}`)),
        bad: listDir(solutionsDir)
          .filter((s) => s.startsWith(`${name}.bad-`))
          .map((s) => ({ name: s.slice(name.length + 5).replace(/\.[^.]+$/, ''), code: read(join(solutionsDir, s)) })),
      });
    }
  }
  return { dir, course, lessons, tasks, teacherNotes };
}
