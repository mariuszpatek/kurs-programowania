// Uploads a course folder (lessons, tasks, tests) to Supabase.
//
//   npm run sync-content -- ../korepetycje_python/platforma/python-podstawy [--dry-run]
//
// Course content is private: it lives outside this public repo and reaches students only
// through Supabase, which serves each student the lessons unlocked for them (RLS).
// Reference solutions in solutions/ are used for validation and never uploaded.
//
// Needs SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const courseDir = args.find((a) => !a.startsWith('--'));
if (!courseDir) {
  console.error('Usage: npm run sync-content -- <course folder> [--dry-run]');
  process.exit(1);
}

const read = (path) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
const readIfExists = (path) => (existsSync(path) ? read(path) : null);
const listDir = (path) => (existsSync(path) ? readdirSync(path).sort() : []);

function frontmatter(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  return { meta: parseYaml(match[1]) ?? {}, body: match[2].trim() };
}

function loadCourse(dir) {
  const course = parseYaml(read(join(dir, 'course.yaml')));
  for (const field of ['slug', 'title', 'language']) if (!course[field]) throw new Error(`course.yaml: missing ${field}`);

  const lessons = listDir(join(dir, 'lessons'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { meta, body } = frontmatter(read(join(dir, 'lessons', f)), f);
      return { number: meta.number, title: meta.title, topics: meta.topics ?? [], body_md: body };
    });

  const tasks = [];
  for (const lessonFolder of listDir(join(dir, 'tasks'))) {
    const lessonNumber = Number(lessonFolder);
    for (const f of listDir(join(dir, 'tasks', lessonFolder)).filter((f) => f.endsWith('.md'))) {
      const name = basename(f, '.md');
      const { meta, body } = frontmatter(read(join(dir, 'tasks', lessonFolder, f)), f);
      const solutionsDir = join(dir, 'solutions', lessonFolder);
      tasks.push({
        lesson_number: lessonNumber,
        number: meta.number,
        slug: `${lessonFolder}-${name}`,
        title: meta.title,
        kind: meta.kind ?? 'code',
        body_md: body,
        starter_code: meta.starter_code ?? '',
        predict_code: meta.predict_code ?? '',
        tests: readIfExists(join(dir, 'tasks', lessonFolder, `${name}.test.py`)) ?? '',
        // validation only, never uploaded
        solution: readIfExists(join(solutionsDir, `${name}.${meta.kind === 'predict' ? 'txt' : 'py'}`)),
        bad: listDir(solutionsDir)
          .filter((s) => s.startsWith(`${name}.bad-`))
          .map((s) => ({ name: s.slice(name.length + 5, -3), code: read(join(solutionsDir, s)) })),
      });
    }
  }
  return { course, lessons, tasks };
}

function validate(tasks) {
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3');
  const result = spawnSync(python, [join(import.meta.dirname, 'validate_content.py')], {
    input: JSON.stringify(tasks),
    encoding: 'utf-8',
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error('Validation failed, nothing was uploaded.');
    process.exit(1);
  }
}

function loadEnv() {
  for (const line of (readIfExists(resolve(import.meta.dirname, '..', '.env')) ?? '').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { course, lessons, tasks } = loadCourse(resolve(courseDir));
console.log(`${course.title}: ${lessons.length} lekcji, ${tasks.length} zadań`);
validate(tasks);
if (dryRun) process.exit(0);

loadEnv();
const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const fail = (what, error) => {
  console.error(`${what}: ${error.message}`);
  process.exit(1);
};

const { data: savedCourse, error: courseError } = await db
  .from('lms_courses')
  .upsert(
    { slug: course.slug, title: course.title, language: course.language, level: course.level ?? '', description: course.description ?? '' },
    { onConflict: 'slug' },
  )
  .select('id')
  .single();
if (courseError) fail('course', courseError);

const { error: lessonError } = await db
  .from('lms_lessons')
  .upsert(lessons.map((l) => ({ ...l, course_id: savedCourse.id })), { onConflict: 'course_id,number' });
if (lessonError) fail('lessons', lessonError);

const { error: taskError } = await db.from('lms_tasks').upsert(
  tasks.map(({ solution, bad, ...t }) => ({ ...t, course_id: savedCourse.id })),
  { onConflict: 'course_id,slug' },
);
if (taskError) fail('tasks', taskError);

// Removed tasks are reported, not deleted: deleting would also delete students' attempts.
const { data: remote } = await db.from('lms_tasks').select('slug').eq('course_id', savedCourse.id);
const orphans = (remote ?? []).map((r) => r.slug).filter((s) => !tasks.some((t) => t.slug === s));
if (orphans.length) console.warn(`W bazie są zadania, których nie ma w folderze (zostawione): ${orphans.join(', ')}`);

console.log(`Wgrano: ${course.slug}`);
