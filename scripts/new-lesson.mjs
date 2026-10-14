// Creates the next lesson of a course with one example task, as a draft.
//
//   npm run new-lesson -- python-podstawy
//
// Fill in the files and run `npm run sync-content`: drafts are visible to the teacher only.
// When the lesson is ready, remove `draft: true` from the lesson and the tasks and sync again.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { contentRoot, courseDirs, loadCourse, pad } from './content.mjs';

const slug = process.argv[2];
const dirs = courseDirs(contentRoot());
const dir = dirs.find((d) => basename(d) === slug);
if (!dir) {
  console.error(`Usage: npm run new-lesson -- <course>\nCourses: ${dirs.map((d) => basename(d)).join(', ')}`);
  process.exit(1);
}

const { lessons } = loadCourse(dir);
const number = Math.max(0, ...lessons.map((l) => l.number)) + 1;
const n = pad(number);

const files = {
  [`lessons/${n}.md`]: `---
number: ${number}
title: Tytuł lekcji ${number}
topics:
  - pierwszy temat
  - drugi temat
draft: true
---

## Pierwszy temat

Krótkie wyjaśnienie, potem przykład. Kod i jego wynik pod spodem pokażą się jako jedna karta:

\`\`\`python
print("Cześć!")
\`\`\`

\`\`\`output
Cześć!
\`\`\`

Komunikat błędu:

\`\`\`error
NameError: name 'Print' is not defined
\`\`\`

## Dla ciekawych

Coś, czego nie było na lekcji, a uczeń może odkryć sam.
`,
  [`tasks/${n}/01-pierwsze-zadanie.md`]: `---
title: Pierwsze zadanie
number: 1
kind: code
starter_code: |
  # tu zaczyna uczeń
draft: true
---

Treść zadania. Jak ma wyglądać wynik:

\`\`\`output
Cześć!
\`\`\`
`,
  [`tasks/${n}/01-pierwsze-zadanie.test.py`]: `def test_wynik(ctx):
    """Program wypisuje powitanie"""
    expect_line(ctx, 1, "Cześć!")
`,
  [`solutions/${n}/01-pierwsze-zadanie.py`]: `print("Cześć!")
`,
  [`solutions/${n}/01-pierwsze-zadanie.bad-literowka.py`]: `print("Czesc!")
`,
};

for (const [path, content] of Object.entries(files)) {
  const full = join(dir, path);
  if (existsSync(full)) {
    console.error(`${full} already exists`);
    process.exit(1);
  }
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  console.log(`  + ${path}`);
}
console.log(`Lekcja ${number} utworzona jako szkic. Po npm run sync-content zobaczysz ją na stronie tylko Ty. Gdy będzie gotowa, usuń „draft: true” i wgraj ponownie.`);
