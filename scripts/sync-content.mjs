// Validates course content and uploads it to Supabase.
//
//   npm run sync-content                       all courses in the content root
//   npm run sync-content -- python-podstawy    one course (folder name or path)
//   npm run sync-content -- --dry-run          validate only
//
// Course content is private: it lives outside this public repo and reaches students only through
// Supabase, which serves each student the lessons unlocked for them (RLS). Lessons and tasks marked
// `draft: true` are skipped. Reference solutions are used for validation and never uploaded.
//
// Needs PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { contentRoot, courseDirs, loadCourse } from './content.mjs';

/** Per-language validator scripts: read tasks as JSON on stdin, exit 1 on problems. */
const VALIDATORS = {
  python: 'validate_python.py',
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const target = args.find((a) => !a.startsWith('--'));
const root = contentRoot();
const path = target ? (existsSync(target) ? resolve(target) : join(root, target)) : root;
const dirs = courseDirs(path);
if (!dirs.length) {
  console.error(`No course (course.yaml) found in ${path}`);
  process.exit(1);
}

function validate(language, tasks) {
  const script = VALIDATORS[language];
  if (!script) {
    console.warn(`  ! brak walidatora dla języka „${language}”, testy nie zostały sprawdzone`);
    return true;
  }
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3');
  const result = spawnSync(python, [join(import.meta.dirname, script)], { input: JSON.stringify(tasks), encoding: 'utf-8' });
  if (result.stdout.trim()) console.log(result.stdout.trimEnd().replace(/^/gm, '  '));
  process.stderr.write(result.stderr);
  return result.status === 0;
}

const courses = dirs.map(loadCourse);
let ok = true;
for (const { course, lessons, tasks } of courses) {
  const live = { lessons: lessons.filter((l) => !l.draft), tasks: tasks.filter((t) => !t.draft) };
  const drafts = lessons.length - live.lessons.length + tasks.length - live.tasks.length;
  console.log(`${course.title} (${course.slug}): ${live.lessons.length} lekcji, ${live.tasks.length} zadań${drafts ? `, szkice pominięte: ${drafts}` : ''}`);
  ok = validate(course.language, live.tasks) && ok;
}
if (!ok) {
  console.error('Walidacja nie przeszła, nic nie zostało wgrane.');
  process.exit(1);
}
if (dryRun) process.exit(0);

const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const check = (what, { error }) => {
  if (error) {
    console.error(`${what}: ${error.message}`);
    process.exit(1);
  }
};

for (const { course, lessons, tasks } of courses) {
  const saved = await db
    .from('lms_courses')
    .upsert(
      {
        slug: course.slug,
        title: course.title,
        language: course.language,
        level: course.level ?? '',
        description: course.description ?? '',
        tutor_prompt: course.tutor_prompt,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();
  check('course', saved);
  const courseId = saved.data.id;

  const liveLessons = lessons.filter((l) => !l.draft).map(({ draft, ...l }) => ({ ...l, course_id: courseId }));
  const liveTasks = tasks.filter((t) => !t.draft).map(({ draft, solution, bad, ...t }) => ({ ...t, course_id: courseId }));
  if (liveLessons.length) check('lessons', await db.from('lms_lessons').upsert(liveLessons, { onConflict: 'course_id,number' }));
  if (liveTasks.length) check('tasks', await db.from('lms_tasks').upsert(liveTasks, { onConflict: 'course_id,slug' }));

  // Tasks removed from the folder are reported, not deleted: deleting would also delete students' attempts.
  const { data: remote } = await db.from('lms_tasks').select('slug').eq('course_id', courseId);
  const orphans = (remote ?? []).map((r) => r.slug).filter((s) => !liveTasks.some((t) => t.slug === s));
  if (orphans.length) console.warn(`  ! w bazie są zadania, których nie ma w folderze (zostawione): ${orphans.join(', ')}`);
  console.log(`  wgrano: ${course.slug}`);
}
