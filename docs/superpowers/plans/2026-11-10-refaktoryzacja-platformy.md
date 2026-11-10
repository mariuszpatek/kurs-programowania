# Plan refaktoryzacji platformy (2026-11-10)

Stan po scaleniu kursów AI, „Wytłumacz koledze”, obrazków w lekcjach i schematów. Kod ma ok. 11 tys. linii.
Plan nie zmienia technologii (Astro, Supabase, Pyodide zostają) ani podziału na dwa repozytoria. Porządkuje
miejsca, które w ostatnich sesjach powodowały błędy, konflikty przy scalaniu albo ręczną robotę.

Każda faza kończy się działającą platformą i osobnym wdrożeniem. Kolejność: od małego ryzyka i dużego zysku.

## Co znalazłem (dowody)

| Problem | Gdzie | Skutek w tej sesji |
|---|---|---|
| Lista rodzajów zadań (`code`, `predict`, `local`, `choice`, `explain`) jest w 8 miejscach | `scripts/content.mjs`, `src/lib/content.ts`, `scripts/validate_python.py`, `scripts/sync-content.mjs`, `src/pages/task.astro`, `src/lib/task-list.ts`, `src/pages/teacher.astro`, każda migracja z `lms_tasks_kind_check` | 5 konfliktów przy scalaniu kursów AI; migracja `lms_llm` wyłożyłaby się na produkcji |
| Tutor przy zadaniach (`assistant`) nie działa na produkcji | `supabase/functions/assistant`: woła OpenRouter, a sekretu `OPENROUTER_API_KEY` nie ma | uczeń dostaje błąd, gdy pyta tutora |
| CI uruchamia tylko część testów i nie robi `astro check` | `.github/workflows/*.yml`: tylko `tests/llm-providers.test.ts` | testy schematów, „Wytłumacz koledze” i Markdownu nie chronią `main` |
| Brak `.gitattributes` | oba repozytoria | skrypt na Windows zapisał pliki z CRLF; cały `content.mjs` wyszedł jako konflikt |
| Nie wiadomo, które migracje są na produkcji | migracje uruchamiane ręcznie | stan bazy trzeba było odczytywać zapytaniami o kolumny i tabele |
| Te same pomocniki w 4 funkcjach brzegowych | CORS, `json()`, dwa klienty Supabase, logowanie i `lms_has_access` w `assistant`, `explain`, `llm`, `lms-invite` | każda poprawka cztery razy |
| Trzy osobne systemy AI z własnymi modelami i limitami | `assistant` (model i limit w env, dzienny limit 24 h), `llm` (model i limit w panelu, dolary miesięcznie), `explain` (model i limit w env, dzień od północy) | nauczyciel zmienia część w panelu, a część tylko przez sekrety i wdrożenie |
| `el()` zdefiniowane 11 razy, w dwóch kolejnościach argumentów | `(tag, text, className)` w 8 plikach, `(tag, className, text)` w `playground.ts`, `stepper.ts` | łatwo zamienić tekst z klasą i nie zauważyć |
| Dwa różne `escapeHtml` | `src/lib/languages/highlight.ts` (bez `"`), `src/lib/untrusted-markdown.ts` (z `"`) | drugi powstał, bo testy w Node nie umieją importować plików `.ts` bez rozszerzenia |
| Duże strony z całą logiką w `<script>` | `teacher.astro` 860 linii, `lesson.astro` 397 | trudno zmienić jedną rzecz w panelu bez czytania całości |
| Skille projektu poza gitem | `.claude/skills/dydaktyka`, `.claude/skills/humanizer` są nieśledzone | utrata przy czyszczeniu folderu; nikt inny ich nie dostanie |

## Faza 0: zabezpieczenia (mała, bez zmian w działaniu)

1. **`.gitattributes` w obu repozytoriach:** `* text=auto eol=lf`, a obrazki (`*.png`, `*.webp`, `*.jpg`, `*.ico`) jako `binary`.
   Sprawdzenie: `git ls-files --eol` nie pokazuje `i/crlf`.
2. **Pełne testy w CI:** w workflow zamiast pojedynczego pliku `npm test`, do tego nowy skrypt `"check": "astro check"`
   uruchamiany przed `npm run build`. Sprawdzenie: celowo zepsuty test na gałęzi blokuje build.
3. **Skille projektu w repozytorium:** commit `.claude/skills/` (bez innych plików z `.claude/`). Wymaga zgody, patrz decyzje.

## Faza 1: jedno źródło prawdy dla rodzajów zadań (średnia)

1. Nowy plik `task-kinds.json` w katalogu głównym: lista rodzajów i ich cechy, np.
   `{ "explain": { "tests": false, "solution": false, "teacherNotes": "required", "badge": "rozmowa z AI · beta" } }`.
2. Z niego czytają:
   - `scripts/content.mjs` (dozwolone rodzaje i komunikat błędu),
   - `scripts/validate_python.py` (co sprawdzać przy danym rodzaju),
   - `scripts/sync-content.mjs` (wymagany klucz nauczyciela zamiast osobnego `checkExplainTasks`),
   - `src/lib/content.ts` (typ `TaskKind` wyprowadzony z listy),
   - `src/lib/task-list.ts` i `task.astro` (plakietka).
3. `task.astro`: łańcuch `if (kind === …) else if …` zamieniony na mapę `rodzaj → funkcja montująca`.
4. Test, który porównuje listę z ostatnią migracją ustawiającą `lms_tasks_kind_check`. Gdy ktoś doda rodzaj bez migracji, test nie przejdzie.
5. W README zasada: nowy rodzaj to nowa migracja z **pełną** listą, nigdy edycja starej.

Sprawdzenie: `npm test`, `astro check`, `sync-content --dry-run` dla wszystkich kursów daje te same liczby co dziś
(python-podstawy: 52 zadania sprawdzone, 123 złe rozwiązania, 89 przykładów).

## Faza 2: funkcje brzegowe i AI (średnia do dużej)

1. **Wspólny kod w `supabase/functions/_shared/`:**
   - `http.ts`: CORS, `json()`, obsługa `OPTIONS`,
   - `auth.ts`: `requireStudent(req)` zwraca `{ user, supabase, admin, isTeacher }` albo gotową odpowiedź 401/403,
   - `types.ts`: `Message` (dziś trzy kopie).
   Najpierw `lms-invite` i `llm`, potem `explain`, na końcu `assistant`.
2. **Tutor `assistant` na wspólnych dostawcach:** zamiast własnego `fetch` do OpenRouter używa `llm/providers.ts`
   i ustawień z `lms_llm_settings` (dziś Anthropic i Haiku 5.5). Dzięki temu działa na istniejącym kluczu Anthropic.
   Dzienny limit liczony od północy, tak jak w „Wytłumacz koledze” (`lms_explain_today_start` przemianowane na `lms_today_start`).
3. **Modele i limity w panelu:** nowe kolumny w `lms_llm_settings` dla tutora i „Wytłumacz koledze”
   (model rozmowy, model podsumowania, limity dzienne ucznia i nauczyciela). Zmienne środowiskowe zostają jako zapas.
   Panel „Model AI” pokazuje wszystkie trzy funkcje w jednym miejscu.
4. **Konto ucznia:** karta „Limity AI” pokazuje też tutora i miesięczne wydatki na `ask()`.

Sprawdzenie po każdym kroku: wdrożenie jednej funkcji, rozmowa z Robciem, pytanie do tutora i `ask()` w kursie AI.
Testy dla `_shared/auth.ts` i dla wyboru limitu (uczeń, nauczyciel).

## Faza 3: front (średnia)

1. **Testy w Vitest** zamiast `node --test --experimental-strip-types`. Vite już jest w projekcie, a moduły
   mogą wtedy importować się nawzajem. Pozwala to usunąć skopiowany `escapeHtml`.
2. **`src/lib/dom.ts`:** jedno `el(tag, { text, className })` i `$`. Zamiana w 11 plikach. Jawne pola usuwają
   pomyłkę z kolejnością argumentów.
3. **Jeden `escapeHtml`** (z `"`) w `src/lib/html.ts`, używany przez podświetlanie i Markdown.
4. **`teacher.astro` na moduły**, tak jak już jest `model-settings.ts`:
   - `src/lib/teacher/students.ts` (karta ucznia, odblokowywanie lekcji, hasło, dodawanie),
   - `src/lib/teacher/activity.ts` (sesje, historia prób, podpowiedzi),
   - `src/lib/teacher/lessons.ts` (publikacja lekcji i notatki).
   Strona zostaje z HTML-em i krótkim skryptem, który składa te części.
5. **`lesson.astro`:** eksport lekcji do Markdownu (`lessonAsMarkdown`, `setUpExport`) do `src/lib/lesson-export.ts`.
6. **CSS (niski priorytet):** `global.css` (1068 linii) podzielony według istniejących sekcji na pliki w `src/styles/`.

Sprawdzenie: `astro check`, testy, a potem przejście w przeglądarce przez panel nauczyciela, lekcję z schematem,
zadanie każdego rodzaju i konto. Zrzuty przed i po dla panelu.

## Faza 4: migracje i wdrażanie (mała do średniej)

1. **Własny rejestr migracji:** tabela `lms_schema_migrations (name, applied_at)`. Nie `supabase_migrations`,
   bo tą historią zarządza druga aplikacja w tym samym projekcie.
2. **`npm run migrate`** (`scripts/migrate.mjs`):
   - pokazuje migracje z folderu, których nie ma w rejestrze,
   - po potwierdzeniu uruchamia je po kolei przez `supabase db query --remote -f` i zapisuje w rejestrze.
   Na start rejestr dostaje wszystkie dzisiejsze migracje jako już wykonane (stan sprawdzony 2026-11-10).
3. **`npm run deploy:functions`:** wdraża wszystkie funkcje z `supabase/functions` (bez `_shared`).
4. **README, sekcja „Wdrożenie”:** jedna lista kroków (migracje, funkcje, push, `sync-content`).

Sprawdzenie: `npm run migrate` na produkcji pokazuje „nic do zrobienia”.

## Czego nie robimy

- Nie zmieniamy frameworka ani nie przepisujemy stron na React czy inny framework UI.
- Nie łączymy repozytoriów treści i platformy.
- Nie przenosimy się z Supabase. Osobny projekt Supabase zamiast wspólnego z drugą aplikacją to osobna decyzja,
  nie część tego planu.

## Decyzje do podjęcia

1. Tutor `assistant`: naprawić na wspólnych dostawcach (Faza 2.2, zalecane) czy na razie ukryć?
2. Modele i limity „Wytłumacz koledze” i tutora: przenieść do panelu (zalecane) czy zostawić w sekretach?
3. Testy: przejść na Vitest (zalecane) czy zostać przy `node --test`?
4. Czy dodać `.claude/skills/` do repozytorium?

## Szacunek

| Faza | Wielkość | Wdrożenie |
|---|---|---|
| 0 | 1 krótka sesja | push |
| 1 | 1 sesja | push, `sync-content` |
| 2 | 2 sesje | migracja, funkcje, push |
| 3 | 2 sesje | push |
| 4 | 1 sesja | migracja (rejestr), push |
