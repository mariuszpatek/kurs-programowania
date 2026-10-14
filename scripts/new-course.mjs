// Creates a new course folder in the content root.
//
//   npm run new-course -- python-zaawansowany "Python dla zaawansowanych" --language python --level Zaawansowany
//
// Then `npm run new-lesson -- <slug>` for the first lesson. The tutor prompt is copied from an existing
// course when there is one, so it only needs small edits.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentRoot, courseDirs } from './content.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [slug, title] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!slug || !title || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: npm run new-course -- <slug> "<title>" [--language python] [--level Podstawy]\nslug: lowercase letters, digits and dashes');
  process.exit(1);
}

const root = contentRoot();
const dir = join(root, slug);
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}

const language = option('language', 'python');
const level = option('level', '');
const existing = courseDirs(root).find((d) => existsSync(join(d, 'tutor-prompt.md')));
const tutorPrompt = existing
  ? readFileSync(join(existing, 'tutor-prompt.md'), 'utf-8')
  : 'Uczę się programowania. Na lekcjach przerobiliśmy do tej pory:\n{{topics}}\n\nBądź moim korepetytorem: podpowiadaj, ale nie pisz za mnie rozwiązań.\n';

mkdirSync(join(dir, 'lessons'), { recursive: true });
mkdirSync(join(dir, 'tasks'), { recursive: true });
mkdirSync(join(dir, 'solutions'), { recursive: true });
writeFileSync(join(dir, 'course.yaml'), `slug: ${slug}\ntitle: ${title}\nlanguage: ${language}\nlevel: ${level}\ndescription: Opis kursu w jednym zdaniu.\n`);
writeFileSync(join(dir, 'tutor-prompt.md'), tutorPrompt);

console.log(`Kurs utworzony: ${dir}`);
console.log(`Dalej: popraw course.yaml i tutor-prompt.md, potem npm run new-lesson -- ${slug}`);
if (language !== 'python') {
  console.log(`Uwaga: język „${language}” nie ma jeszcze uruchamiania w przeglądarce ani walidatora (src/lib/languages, scripts/sync-content.mjs).`);
}
