import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIND_RULES, MAX_CHARS, REMINDER, TUTOR_NAME, courseText, tutorSystem, withoutAnswers, type TutorTask } from '../supabase/functions/assistant/prompt.ts';

const course = { title: 'Python od podstaw', level: 'liceum', assistant_notes: '' };
const lessons = [
  { number: 1, title: 'print', topics: ['print', 'zmienne'] },
  { number: 2, title: 'if', topics: ['if', 'else'] },
];
const task = (over: Partial<TutorTask> = {}): TutorTask => ({
  kind: 'code',
  title: 'Bilet do kina',
  body_md: 'Napisz program, który sprawdza wiek.',
  predict_code: '',
  hints: [],
  lesson_number: 2,
  ...over,
});
const page = { code: 'wiek = 15', result: '', hintsOpened: 0 };

test('the tutor knows its name, the same one the site shows', () => {
  assert.match(tutorSystem(task(), course, lessons, page), new RegExp(`^# Kim jesteś

Nazywasz się ${TUTOR_NAME} `));
  assert.match(readFileSync('src/lib/tutor-name.ts', 'utf-8'), new RegExp(`TUTOR_NAME = '${TUTOR_NAME}'`));
});

test('every kind of task the tutor is shown at has its own rule; explain is Robcio, so it has none', () => {
  for (const kind of ['code', 'predict', 'choice', 'local']) assert.ok(KIND_RULES[kind]?.rule, kind);
  assert.equal(KIND_RULES.explain, undefined);
});

test('the course: name, level and topics up to the task lesson', () => {
  const text = courseText(course, 2, lessons);
  assert.match(text, /^Kurs: Python od podstaw, liceum\. Zadanie do lekcji 2 \(if\)/);
  assert.match(text, /- Lekcja 1 \(print\): print; zmienne\n- Lekcja 2 \(if\): if; else/);
});

test('the teacher note on the course goes in only when there is one', () => {
  assert.doesNotMatch(tutorSystem(task(), course, lessons, page), /<od_nauczyciela>/);
  const withNote = tutorSystem(task(), { ...course, assistant_notes: 'ask() to gotowa funkcja.' }, lessons, page);
  assert.match(withNote, /<od_nauczyciela>\nask\(\) to gotowa funkcja\.\n<\/od_nauczyciela>/);
});

test('closed questions reach the tutor without the answer key', () => {
  const body = ['Co się wypisze?', '', '```python', 'print(3 * 9)', '```', '', '- [ ] 3', '  Tyle wyjdzie przy jednym obrocie.', '- [x] 27', '  `x` ma po kolei 1, 3, 9…', '', 'Koniec.'].join('\n');
  const cleaned = withoutAnswers(body);
  assert.match(cleaned, /^- 3$/m);
  assert.match(cleaned, /^- 27$/m);
  assert.doesNotMatch(cleaned, /\[x\]|\[ \]|Tyle wyjdzie|po kolei/);
  assert.match(cleaned, /print\(3 \* 9\)/);
  assert.match(cleaned, /Koniec\./);
  const system = tutorSystem(task({ kind: 'choice', body_md: body }), course, lessons, page);
  assert.doesNotMatch(system, /\[x\]|po kolei/);
  assert.match(system, /Nie mów, która odpowiedź jest dobra/);
});

test('other kinds keep their text as it is', () => {
  const body = '- [x] zrobione\n  szczegóły';
  assert.match(tutorSystem(task({ body_md: body }), course, lessons, page), /- \[x\] zrobione\n  szczegóły/);
});

test('hints: the tutor sees them and how many the student opened', () => {
  const system = tutorSystem(task({ hints: ['Kierunek', 'Przyczyna', 'Krok'] }), course, lessons, { ...page, hintsOpened: 1 });
  assert.match(system, /<podpowiedzi>\nUczeń otworzył 1 z 3 podpowiedzi\.\n1\. Kierunek\n2\. Przyczyna\n3\. Krok\n<\/podpowiedzi>/);
  assert.doesNotMatch(tutorSystem(task(), course, lessons, page), /<podpowiedzi>/);
  assert.match(tutorSystem(task({ hints: ['a'] }), course, lessons, { ...page, hintsOpened: 5 }), /otworzył 1 z 1/);
});

test("the student's work: code in the editor, handed-in text for local tasks, nothing for predict", () => {
  assert.match(tutorSystem(task(), course, lessons, page), /<praca_ucznia opis="Aktualny kod ucznia">\nwiek = 15\n<\/praca_ucznia>/);
  assert.match(tutorSystem(task({ kind: 'local' }), course, lessons, { ...page, code: 'github.com/x' }), /opis="Co uczeń wpisał do pola „oddaj pracę”"/);
  assert.doesNotMatch(tutorSystem(task({ kind: 'local' }), course, lessons, { ...page, code: '  ' }), /<praca_ucznia/);
  const predict = tutorSystem(task({ kind: 'predict', predict_code: 'print(2 + 2)' }), course, lessons, { ...page, code: 'print(2 + 2)' });
  assert.doesNotMatch(predict, /<praca_ucznia/);
  assert.match(predict, /<zadanie>\nBilet do kina\n\nNapisz program, który sprawdza wiek\.\n\nprint\(2 \+ 2\)\n<\/zadanie>/);
});

test('the result: what the page sent, or a note that nothing ran yet; long input is cut', () => {
  assert.match(tutorSystem(task(), course, lessons, page), /<wynik>\n\(jeszcze nic nie uruchomiono ani nie sprawdzono\)\n<\/wynik>/);
  assert.match(tutorSystem(task(), course, lessons, { ...page, result: 'Wyjście:\n15' }), /<wynik>\nWyjście:\n15\n<\/wynik>/);
  const long = tutorSystem(task(), course, lessons, { ...page, code: 'x'.repeat(MAX_CHARS + 500) });
  assert.ok(long.includes('x'.repeat(MAX_CHARS)) && !long.includes('x'.repeat(MAX_CHARS + 1)));
});

test('the reminder about gender-neutral Polish is the last thing the tutor reads', () => {
  assert.ok(tutorSystem(task(), course, lessons, page).endsWith(`</wynik>\n\n${REMINDER}`));
});

test('an unknown kind falls back to the code rule', () => {
  assert.match(tutorSystem(task({ kind: 'nowy' }), course, lessons, page), new RegExp(KIND_RULES.code.rule.slice(0, 40)));
});
