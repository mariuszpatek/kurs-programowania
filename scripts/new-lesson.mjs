// Creates the next lesson of a course with one example task.
//
//   npm run new-lesson -- python-podstawy
//
// Fill in the files and run `npm run sync-content`: a new lesson arrives as a draft only the teacher sees.
// When it is ready, publish it with the button in the teacher dashboard.
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

// Every feature of a lesson in one place, so the syntax does not have to be remembered.
// The full guide for writing lessons: korepetycje_python/platforma/JAK-PISAC.md
const files = {
  [`lessons/${n}.md`]: `---
number: ${number}
title: Tytuł lekcji ${number}
topics:
  - pierwszy temat
  - drugi temat
---

## Pierwszy temat

Krótkie wyjaśnienie, potem przykład. Nazwy w kodzie po angielsku, teksty dla użytkownika po polsku.
Kod i jego wynik pod spodem pokażą się jako jedna karta, a "krok" dodaje przycisk „Krok po kroku”
(słowa po "krok" to odpowiedzi dla input(), np. \`python krok 16\`):

\`\`\`python krok
name = "Ola"
print("Cześć,", name)
\`\`\`

\`\`\`output
Cześć, Ola
\`\`\`

<!-- nauczyciel: przyklad -->

Komunikat błędu:

\`\`\`error
NameError: name 'Print' is not defined
\`\`\`

<!-- Rysunek: plik lessons/img/nazwa.svg (generator: lessons/img/_rysunki.py), potem w osobnej linijce:
![Podpis pod rysunkiem](img/nazwa.svg) -->

<!-- Na końcu działu: karta „Sprawdź się” z linkiem do zadania o tym, co właśnie było (numer zadania tej lekcji) -->
<!-- zadanie: 1 -->

## Dla ciekawych

Coś, czego nie było na lekcji, a uczeń może odkryć sam.
`,
  [`lessons/${n}.teacher.md`]: `## Plan lekcji (ok. 60 min)

| Czas | Co | Jak |
|---|---|---|
| 0–10 | Omówienie zadań domowych z lekcji ${number - 1} | w panelu: które zadania i ile prób |
| 10–50 | Pierwszy temat | **zadanie na lekcji 1** |
| 50–60 | Zadania domowe | |

## @przyklad Co powiedzieć przy pierwszym przykładzie

Ta sekcja pokaże się nauczycielowi w lekcji w miejscu znacznika \`<!-- nauczyciel: przyklad -->\`.
Pisz pełnymi zdaniami: co zapytać i jaka odpowiedź ma paść.
`,
  [`tasks/${n}/01-pierwsze-zadanie.md`]: `---
title: Pierwsze zadanie
number: 1
kind: code
in_class: true
starter_code: |
  # tu zaczyna uczeń
hints:
  - |-
    Pierwsza podpowiedź: ogólny kierunek, bez kodu.
  - |-
    Druga: konkretniej, nadal bez gotowej linijki.
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
  [`tasks/${n}/01-pierwsze-zadanie.teacher.md`]: `**Przykładowe rozwiązanie:**

\`\`\`python krok
print("Cześć!")
\`\`\`

**Wyjaśnienie:** dlaczego tak.

**Typowe błędy:** co uczeń zrobi źle i co wtedy zobaczy.
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
console.log(`Lekcja ${number} utworzona. Po npm run sync-content zobaczysz ją na stronie jako szkic (tylko Ty). Publikujesz ją przyciskiem w panelu.`);
