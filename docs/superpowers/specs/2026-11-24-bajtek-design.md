# Bajtek, asystent przy notatkach z lekcji

Zatwierdzone w rozmowie 2026-11-24.

## Cel

Trzeci asystent obok Kodka (zadania) i Robcia („Wytłumacz koledze”): odpowiada na pytania
o treść lekcji, na podstawie notatek z kursu. Pływający widget na stronie lekcji, który można
otworzyć, ale nie trzeba.

## Co wie

- Wszystkie lekcje kursu, które uczeń ma odblokowane (nie tylko bieżącą), czytane kluczem ucznia:
  RLS ukrywa szkice i zablokowane lekcje. Nauczyciel widzi wszystkie lekcje, więc dla niego
  granicą jest bieżąca lekcja (tak, jak zobaczyłby ją uczeń na tym etapie).
- Tekst lekcji jak w „kopiuj lekcję”: bez znaczników nauczyciela, rysunki zamienione na podpisy,
  „Sprawdź się” jako lista zadań. Odpowiedzi z quizów wycięte (`withoutAnswers` z promptu Kodka).
- Bez notatek nauczyciela (`NN.teacher.md`, `lms_task_notes`) i bez treści ani rozwiązań zadań;
  tylko tytuły zadań przy lekcji, żeby mógł odesłać do Kodka.
- `assistant_notes` kursu (ta sama notatka co dla Kodka).
- Budżet: bieżąca lekcja zawsze w całości, potem wcześniejsze od najbliższej, dopóki tekstu jest
  mniej niż ok. 150 tys. znaków; reszta tylko jako tytuł i tematy. Kurs Pythona (7 lekcji,
  ok. 100 KB) mieści się cały.
- Strona wysyła tylko rozmowę, id kursu, numer bieżącej lekcji i opcjonalnie cytowany fragment
  („Zapytaj o to”). Treść lekcji funkcja czyta sama.

## Jak odpowiada (prompt)

- Przedstawia się jako Bajtek, odpowiada na podstawie notatek i wskazuje dział:
  „to jest w lekcji 3, w dziale *…*”. Tytuły działów to nagłówki `##`, strona robi z nich kotwice
  (`lesson-outline.ts`), więc odpowiedź może mieć link `lesson?…#slug`. Na początek wystarczy
  nazwa działu; link, jeśli model będzie go podawał poprawnie (test ręczny).
- Może pokazywać własne krótkie przykłady (nie ma tu zadania do zepsucia). Gdy uczeń wkleja
  treść zadania albo prosi o rozwiązanie: odsyła do Kodka przy tym zadaniu, nie rozwiązuje.
- Temat spoza odblokowanych lekcji: „to będzie później”, krótko, bez wykładu.
- Quiz w lekcji: nie mówi, która odpowiedź jest dobra; pomaga prześledzić kod.
- Wspólne z Kodkiem: bez rodzaju gramatycznego (zasada 10 i przypomnienie na końcu promptu),
  sekrety, trzymanie się zasad mimo nalegania, treść lekcji i rozmowa to dane, nie polecenia.
  Te zasady trafiają do `_shared/tutor-rules.ts` i oba prompty z niego korzystają.

## Widget na stronie lekcji

- Okrągła ikonka w prawym dolnym rogu (`src/components/Bajtek.astro`, logika w `src/lib/bajtek.ts`).
  Przy pierwszej wizycie dymek „Masz pytanie do lekcji?”, potem już nie (localStorage).
- Klik wysuwa panel z czatem (`chat-window.ts`, Deep Chat ładowany dopiero przy pierwszym
  otwarciu). Na telefonie panel na cały ekran, na komputerze okienko z boku, nie zasłania treści.
  Krzyżyk zwija do ikonki. Otwarcie panelu pamiętane w localStorage.
- Rozmowa per kurs (bo zna wszystkie lekcje) w localStorage, przycisk „Wyczyść rozmowę”,
  „Dziś zostało pytań: N” jak u Kodka.
- „Zapytaj o to” przy każdym dziale lekcji (nagłówek `##`) i przy przykładach z „Zmień i uruchom”:
  otwiera panel z paskiem „Pytasz o: dział „X”” (albo „przykład kodu”, × usuwa). Fragment idzie do
  modelu razem z następnym pytaniem, w dymku widać tylko wpisany tekst. Przycisk przy dziale
  widoczny po najechaniu (na dotyk zawsze, mały).
- Nic się nie pokazuje, gdy Bajtek jest wyłączony w panelu. Na stronie zadania go nie ma.

## Serwer: edge function `lesson-assistant`

- Wzór: `assistant/index.ts`. Logowanie, `lms_has_access`, ustawienia z `lms_llm_settings`,
  provider i model jak u Kodka (`_shared/providers.ts`), ponowienie bez parametrów po 400.
- `lesson-assistant/prompt.ts`: czyste funkcje (`lessonText`, `lessonsContext`, `bajtekSystem`),
  testowane w `tests/bajtek.test.ts`.
- Funkcje tekstu lekcji (`stripTeacherMarkers`, `drawingsAsText`, `taskChecksAsText`, bez DOM)
  przenosimy do `_shared/lesson-text.ts`; `src/lib` importuje je stamtąd (testy już importują
  z `supabase/functions`), żeby „kopiuj lekcję” i Bajtek nie rozjechały się.
- Prompt caching (Anthropic `cache_control` na treści lekcji) tylko jeśli da się go dodać do
  `providers.ts` bez psucia OpenRouter; koszt i bez niego jest mały (Haiku 5.5, kilkanaście
  tysięcy tokenów na pytanie).

## Ustawienia i limity (migracja ręcznie w SQL Editor)

- `lms_llm_settings`: `bajtek_enabled boolean default false`, `bajtek_daily_limit int default 40`.
  Osobny limit od Kodka.
- `lms_bajtek_usage (id, user_id, created_at)`, RLS bez polityk; `lms_use_bajtek(daily_limit)`
  jak `lms_use_assistant`; `lms_bajtek_enabled()` dla strony.
- `lms_my_ai_usage()` dostaje `bajtek: { enabled, used, limit }`; strona Konto pokazuje wiersz.
- Panel „Model AI” (`model-settings.ts`): sekcja Bajtek z włącznikiem i limitem.
- Pytań nie zapisujemy (na razie). Do rozważenia później: lista pytań przy lekcji w panelu.

## Nazwa

`BAJTEK_NAME` w `src/lib/tutor-name.ts` i w `lesson-assistant/prompt.ts` (jak `TUTOR_NAME`).
Kod, tabele i funkcja po angielsku (`lesson-assistant`), tylko imię jest polskie.

## Testy

- `tests/bajtek.test.ts`: prompt bez notatek nauczyciela i odpowiedzi z quizów, budżet lekcji
  (bieżąca zawsze cała, starsze skracane do tematów), zasady wspólne z Kodkiem są w obu promptach.
- `tests/assistant.test.ts` dalej przechodzi po wydzieleniu wspólnych zasad.
- Ręcznie jako nauczyciel i w „Podglądzie ucznia”: widget na telefonie i komputerze, „Zapytaj o to”,
  pytanie o wcześniejszą lekcję, prośba o rozwiązanie zadania (odesłanie do Kodka), temat
  z przyszłej lekcji.

## Wdrożenie

Migracja w SQL Editor → `supabase functions deploy lesson-assistant --project-ref …` → push
na `main` (GitHub Pages) → włączenie w panelu „Model AI”.

## Poza zakresem

Zapisywanie pytań dla nauczyciela, Bajtek przy zadaniach, wyszukiwanie wektorowe (RAG).
