# Kurs programowania

Platforma do korepetycji z programowania: lekcje, zadania sprawdzane automatycznie w przeglądarce, panel nauczyciela. Na razie kurs „Python od zera”, w przyszłości kolejne kursy i poziomy.

Adres: https://mariuszpatek.github.io/kurs-programowania/

Interfejs jest po polsku, kod (TypeScript, Python, SQL) po angielsku.

## Jak to działa

- **Dostęp tylko po zalogowaniu.** Logowanie linkiem z maila (bez hasła). Konto zakłada nauczyciel, strona sama kont nie tworzy.
- **Treść nie jest w tym repo.** Lekcje, zadania i testy są w Supabase. Reguły RLS wydają uczniowi tylko kursy, na które jest zapisany, i tylko lekcje do numeru `unlocked_through`. Zbudowana strona to pusta aplikacja, która bez logowania nic nie pokaże.
- **Python działa w przeglądarce** (Pyodide w Web Workerze). Program działający dłużej niż 5 s jest zatrzymywany (kod z `ask()`/`chat()` ma 2 min, kod importujący numpy, pandas, scikit-learn, pydantic, polars, duckdb albo sqlalchemy 1 min, bo pierwszy import pobiera pakiet). Pakiety z Pyodide ładują się same, gdy kod je importuje; do walidacji treści lokalnie potrzebne są te same pakiety (`py -m pip install --user numpy pydantic`).
- **Próby** (każde „Sprawdź”) trafiają do `lms_attempts`. Nauczyciel widzi je w panelu `/teacher/`.

## Treść kursów

Treść leży w prywatnym folderze `../korepetycje_python/platforma/` (inny można ustawić w `.env` jako `CONTENT_DIR`). Zasady pisania lekcji (nazwy po angielsku, bez spoilerów, jak pisać notatki) są w `platforma/JAK-PISAC.md`. Każdy podfolder to jeden kurs:

```
python-podstawy/
  course.yaml                       slug, title, language, level, description
  tutor-prompt.md                   prompt do skopiowania do własnego czatu AI ("Pomoc z AI" w lekcji); {{topics}} = tematy lekcji do bieżącej
  assistant.md                      notatka dla asystenta przy zadaniach: kim są uczniowie kursu, co ma wiedzieć o kursie (opcjonalnie)
  lessons/01.md                     frontmatter: number, title, topics
  lessons/01.teacher.md             notatki tylko dla nauczyciela (plan, pytania, notatki przy fragmentach lekcji)
  lessons/img/nazwa.svg             rysunki; generator: lessons/img/_rysunki.py
  tasks/01/01-nazwa.md              frontmatter: title, number, kind (code | predict | local | choice | explain), draft?, in_class?, starter_code?, predict_code?, hints?
  tasks/01/01-nazwa.teacher.md      rozwiązanie z wyjaśnieniem, tylko dla nauczyciela
  tasks/01/01-nazwa.test.py         testy: funkcje test_*(ctx)
  solutions/01/01-nazwa.py          wzorcowe rozwiązanie (dla predict: .txt z oczekiwanym wynikiem)
  solutions/01/01-nazwa.bad-opis.py typowy błąd ucznia, który testy muszą wyłapać
```

### Nowa lekcja

```
npm run new-lesson -- python-podstawy     # tworzy lekcję N+1 z przykładowym zadaniem, jako szkic
npm run sync-content -- --dry-run         # sama walidacja
npm run sync-content                      # walidacja i wgranie wszystkich kursów
```

Nowa lekcja trafia do bazy jako szkic: widzi ją tylko nauczyciel (z oznaczeniem „szkic”), więc można ją przejrzeć na stronie przed zajęciami. Publikuje się ją przyciskiem w panelu (sekcja „Lekcje”) albo na stronie lekcji. `sync-content` nie zmienia tego, czy lekcja jest opublikowana, a nowe zadanie dostaje status swojej lekcji. Uczeń widzi opublikowaną lekcję, gdy ma ją odblokowaną (+ przy uczniu).

Zadanie `kind: local` robi się na komputerze (Postgres, Docker, SDK z kluczem API, chmura): strona pokazuje polecenie i pole na link do repozytorium albo opis, „Oddaj” zapisuje próbę widoczną w panelu. Takie zadanie nie ma testów.

Zadania z `in_class: true` są na liście osobno, jako „Na lekcji”, przed zadaniami domowymi.

Uczeń zobaczy lekcję dopiero po odblokowaniu jej w panelu (przycisk + przy uczniu). Prompt korepetytora pod lekcją aktualizuje się sam z listy `topics`.

### Nowy kurs

```
npm run new-course -- python-zaawansowany "Python dla zaawansowanych" --level Zaawansowany
npm run new-lesson -- python-zaawansowany
```

Kurs w innym języku (`--language csharp`) działa od razu jako lekcje i zadania do czytania. Żeby kod dało się uruchamiać i sprawdzać na stronie, trzeba dopisać język w `src/lib/languages/` (tryb edytora, kolorowanie, runner) i walidator w `scripts/sync-content.mjs` (`VALIDATORS`).

### Kod w treści lekcji

| Blok | Wygląd |
|---|---|
| ```` ```python ```` | kod z kolorowaniem, podpisem języka i przyciskiem „Kopiuj” |
| ```` ```python błąd ```` | kod z celowym błędem składni (walidacja go nie kompiluje) |
| ```` ```python krok ```` | to samo plus przycisk „Krok po kroku” (słowa po `krok` to odpowiedzi dla `input()`, np. ```` ```python krok 16 ````) |
| ```` ```output ```` | wynik programu w stylu konsoli |
| ```` ```error ```` | komunikat błędu w stylu konsoli, na czerwono |
| ```` ``` ```` | zwykły tekst z przyciskiem „Kopiuj” |

Blok kodu, po którym od razu jest `output` albo `error`, wyświetla się jako jedna karta: kod, a pod nim wynik.

Ramki (składnia jak na GitHubie):

```
> [!WARNING]
> Zaznacz „Add python.exe to PATH”.
```

`[!NOTE]` to „Dobrze wiedzieć”, `[!TIP]` to „Wskazówka”, `[!IMPORTANT]` to „Ważne”, a `[!WARNING]` to „Uwaga”. Każdy nagłówek `##` staje się numerowaną sekcją i pozycją w spisie treści, a `###` to podtytuł wewnątrz sekcji.

### Sprawdź się (`src/lib/task-checks.ts`)

Znacznik `<!-- zadanie: 3 -->` w lekcji (na końcu działu) pokazuje w tym miejscu kartę „Sprawdź się” z linkiem do zadania 3 tej lekcji i jego stanem; po zaliczeniu karta robi się zielona. Kilka zadań w jednej karcie: `<!-- zadanie: 3, 4 -->`. Zadania dalej są też na liście pod lekcją. `sync-content` odrzuca znacznik z numerem, którego lekcja nie ma.

Pytanie zamknięte (`src/lib/quiz.ts`) to lista z polami wyboru, `[x]` przy dobrej odpowiedzi; pierwsza linijka punktu to odpowiedź, wcięta linijka pod nią to wyjaśnienie:

```markdown
- [ ] 9
  Pętla nie zatrzymuje się, zanim przekroczy 10…
- [x] 27
  `x` ma po kolei 1, 3, 9…
```

Na stronie są z tego przyciski A) B) C)…: zła odpowiedź robi się czerwona i pokazuje swoje wyjaśnienie, dobra zielona i zamyka pytanie. `sync-content` odrzuca quiz bez dokładnie jednego `[x]` albo z odpowiedzią bez wyjaśnienia.

Zadanie `kind: choice` to kilka takich pytań w treści zadania: blok ```` ```python ```` i zaraz pod nim lista z odpowiedziami. Edytora nie ma; zadanie zalicza się, gdy każde pytanie ma dobrą odpowiedź, a każde kliknięcie zapisuje się jako próba (podpowiedzi, panel). Pliku w `solutions/` nie ma: `sync-content` uruchamia kod pytania i sprawdza, że wypisuje to, co odpowiedź z `[x]` (kilka linijek po przecinku: `10, 20, 30`). Wymaga migracji `20261108000000_lms_task_choice.sql`.

Zadanie `kind: explain` (beta) to rozmowa „Wytłumacz koledze”: uczeń tłumaczy pojęcia z treści zadania Robciowi, którego gra Claude w edge function `explain` (rozmowa: Haiku 5.5, podsumowanie: Sonnet 5.5; zmienia się w panelu → „Model AI”). Robcio dopytuje według klucza z `NN-nazwa.teacher.md` (obowiązkowy, uczeń go nie widzi), a „Zakończ i podsumuj” daje ocenę każdego pojęcia; zaliczenie i próbę zapisuje funkcja, nie przeglądarka. Limity (też w panelu): wiadomości dziennie od północy (uczeń 60, nauczyciel 300), wiadomości ucznia w jednym zadaniu (80) i 20 wiadomości ucznia w jednej rozmowie. Wymaga migracji `20261109000000_lms_task_explain.sql` i `20261110180000_lms_ai_settings.sql`, sekretu `ANTHROPIC_API_KEY` i `supabase functions deploy explain`. `draft: true` we frontmatterze sprawia, że nowe zadanie wchodzi jako szkic także w opublikowanej lekcji.

Pod „Krok po kroku”, schematem i rysunkami jest suwak „Tempo” dla „Odtwórz” (`src/lib/step-controls.ts`), zapamiętywany w przeglądarce.

### Zmień i uruchom (`src/lib/playground.ts`)

Każdy przykład w lekcji w języku, który działa w przeglądarce, ma przycisk „Zmień i uruchom”: karta zamienia się w miejscu w edytor z „Uruchom”, „Krok po kroku” (dla zmienionego kodu) i „Przywróć”. Dane dla `input()` są wypełnione słowami po `krok`. Zmiany zostają tylko w przeglądarce ucznia, nic nie trafia do bazy.

### Krok po kroku (`src/lib/stepper.ts`)

Przykład ```` ```python krok ```` uruchamia się w przeglądarce (`checker.trace`): po każdej linijce widać zmienne z typami i to, co jest na ekranie. Z „Pokaż liczenie w linijce” każda linijka rozkłada się na wartości, jak „step into” w Thonny (`age = int('16')` → `age = 16`). Przyciski Wstecz / Dalej / Odtwórz są wspólne z rysunkami (`src/lib/step-controls.ts`).

Widok „Schemat” (`src/lib/flowchart/`): `checker.flowchart` zamienia kod na bloki, `layout.ts` układa schemat blokowy (program i osobno każda funkcja), `progress.ts` wylicza z kroków bieżący blok, wybraną strzałkę, wartość warunku i obroty pętli, a `render.ts` rysuje SVG. Kod, którego schemat nie zna (`try`, klasy…) albo ponad 40 bloków: przełącznika nie ma. Widzą go wszyscy; tylko nauczyciel: `FLOWCHARTS_FOR_STUDENTS = false` w `src/pages/lesson.astro`. Przykład ```` ```python schemat ```` otwiera kroki sam, od razu na schemacie, gdy czytelnik dojdzie do niego w lekcji (Python ładuje się dopiero wtedy); `sync-content` odrzuca taki przykład, jeśli schemat go nie narysuje.

### Rysunki (`src/lib/diagrams.ts`)

Plik `lessons/img/nazwa.svg`, w lekcji w osobnej linijce `![Podpis](img/nazwa.svg)`. `sync-content` wkleja rysunek do treści lekcji, więc nie trzeba go nigdzie hostować i jest tak samo prywatny jak lekcja. Rysunek używa tylko klas z `src/styles/lesson-widgets.css` (`box`, `str`, `num`, `bool`, `label`, `arrow` …), dzięki czemu pasuje do strony i do ciemnego motywu; własne kolory, `id` i skrypty są odrzucane przy wgrywaniu.

Rysunek krokowy: `<svg data-steps="3">`, na elementach `data-step="2"` (pojawia się w kroku 2), `data-only="2"` (tylko w kroku 2), `data-from="dx,dy"` (przylatuje z przesunięcia), `data-delay="ms"` (kaskada), a `<desc data-step="2">` to podpis kroku. Najprościej: funkcja w `lessons/img/_rysunki.py` z pomocnikami z `_svg.py`.

### Notatki dla nauczyciela

`lessons/NN.teacher.md` pokazuje się nauczycielowi nad lekcją. Sekcja `## @slug Tytuł` trafia w miejsce znacznika `<!-- nauczyciel: slug -->` w lekcji jako zwijane pole. `tasks/NN/nazwa.teacher.md` to pole „Rozwiązanie i wyjaśnienie” pod zadaniem. Uczeń nie dostaje żadnej z nich (osobne tabele z RLS). Podpowiedzi dla ucznia (`hints:` w zadaniu) odblokowują się po nieudanych sprawdzeniach.

### Walidacja

Wzorcowe rozwiązanie musi przejść wszystkie testy, a każde `bad-*` oblać przynajmniej jeden. Każdy przykład ```` ```python ```` w lekcji musi się kompilować, a ```` ```python krok ```` uruchomić (błąd w trakcie wolno, lekcje pokazują błędy celowo). Notatka `@slug` musi mieć znacznik w lekcji i odwrotnie, a rysunek nie może mieć własnych kolorów. Jeśli coś nie przejdzie, nic nie zostanie wgrane. Ostrzeżenia (wgranie idzie dalej): przykład w lekcji powtarza dwie linijki rozwiązania zadania (spoiler), rysunek nie jest użyty w żadnej lekcji. Zadań usuniętych z folderu skrypt nie kasuje w bazie (skasowałby próby uczniów), tylko je wypisuje.

### API testów (`public/py/checker.py`)

| | |
|---|---|
| `ctx.lines` | wypisane linijki (bez spacji na końcu) |
| `ctx.variables` | zmienne po zakończeniu programu |
| `ctx.run("Ola\n16\n")` | uruchomienie z danymi dla `input()`; zwraca wynik z `.lines` i `.variables` |
| `ctx.code`, `ctx.code_lines` | kod ucznia (linie bez pustych i komentarzy) |
| `expect_line(ctx, 1, "Mam 16 lat", stdin="")` | porównanie linijki z czytelnym komunikatem |
| `ctx.function("count_pairs")` | funkcja albo klasa ucznia; brak to porażka z komunikatem „Nie ma funkcji …” |
| `ctx.call("count_pairs", words)` | wywołanie funkcji ucznia (dla klasy: utworzenie obiektu, `ctx.call("BM25")`); wyjątek to porażka z treścią wywołania, wypisany tekst jest pomijany |
| `model = ctx.fake_model(["odp. 1", "odp. 2"])` | udawany model: `ask()` / `chat()` w kodzie ucznia dostają te odpowiedzi po kolei (albo funkcję wiadomości); `model.calls`, `model.prompts` to, o co pytano |

Docstring testu to nazwa widoczna dla ucznia, a komunikat w `assert` to podpowiedź po porażce (po polsku). `input()` wypisuje zachętę i wpisaną wartość, tak jak terminal.

## Model językowy w zadaniach

W kodzie ucznia są `ask(prompt, system=None, temperature=None, max_tokens=None)` i `chat(messages, ...)`, zwracają tekst odpowiedzi. Na stronie idą przez edge function `llm` (synchroniczne zapytanie z workera Pyodide, więc kod ucznia nie potrzebuje `async`); błąd (limit, dostawca, brak sieci) to wyjątek `ModelError`. Pod wynikiem widać model, liczbę zapytań i koszt. W testach zadań `ctx.fake_model` podmienia model, więc sprawdzanie nic nie kosztuje; w `sync-content` prawdziwego modelu nie ma.

Panel → „Model AI”: dostawca (**Anthropic** albo **OpenRouter**, przełączany bez wdrażania), modele (domyślnie Claude Haiku 5.5: `claude-haiku-5-5` / `anthropic/claude-haiku-5.5`), effort (ile model myśli przed odpowiedzią, domyślnie `low`), ceny do liczenia kosztu (OpenRouter podaje koszt sam), limit miesięczny ucznia i nauczyciela, zużycie w tym miesiącu i limit dla konkretnej osoby. Każde wywołanie jest w `lms_llm_usage`; po przekroczeniu limitu funkcja odmawia przed wywołaniem dostawcy. Nowsze modele nie przyjmują `temperature`, starsze `effort`: po błędzie 400 funkcja pyta jeszcze raz bez nich, a pod wynikiem widać, że temperatura została pominięta.

## Uczniowie

Panel `/teacher/` → „Dodaj ucznia”: e-mail, kurs i numer lekcji, do której ma dostęp. Przyciski −/+ przy uczniu odblokowują kolejne lekcje. Konto zakłada edge function `lms-invite`.

Przy każdym uczniu jest „Historia wejść”: kiedy był na platformie i co otwierał, zgrupowane w sesje (przerwa ponad 30 min to nowa sesja), razem z próbami zadań. Strony kursu, lekcji i zadania zapisują wejście w `lms_visits` (to samo otwarcie w ciągu 10 min liczy się raz). Wejścia nauczyciela nie są zapisywane.

## Supabase

Projekt Supabase może być współdzielony z inną aplikacją, dlatego wszystko ma prefiks `lms_`. Migracje z `supabase/migrations/` uruchamia się ręcznie w SQL Editorze, po kolei, nie przez `supabase db push` (historią migracji projektu zarządza tamta aplikacja). Nauczyciela dopisuje się raz:

```sql
insert into public.lms_teachers (email) values ('twoj@email');
```

W Authentication → URL Configuration → Redirect URLs musi być adres strony z `/**` na końcu i `http://localhost:4321/**`.

Edge functions:

```
supabase functions deploy lms-invite --project-ref <project-ref>
supabase functions deploy llm --project-ref <project-ref>         # model dla ask() / chat()
supabase functions deploy assistant --project-ref <project-ref>   # asystent przy zadaniach
supabase functions deploy explain --project-ref <project-ref>     # Wytłumacz koledze
supabase secrets set ANTHROPIC_API_KEY=... --project-ref <project-ref>
supabase secrets set OPENROUTER_API_KEY=... --project-ref <project-ref>   # tylko gdy w panelu wybrany OpenRouter
```

`llm` i `assistant` korzystają ze wspólnego `supabase/functions/_shared/providers.ts`. Modele i limity wszystkich trzech funkcji AI ustawia się w panelu → „Model AI” (tabela `lms_llm_settings`, migracja `20261110180000_lms_ai_settings.sql`; notatka kursu dla asystenta wymaga `20261111120000_lms_course_assistant_notes.sql`). Tam też włącza się asystenta (Debuś; nazwa w `src/lib/tutor-name.ts` i `supabase/functions/assistant/prompt.ts`): pojawia się wtedy pod edytorem w każdym zadaniu (poza „Wytłumacz koledze”), w tym samym okienku czatu co Robcio (`src/lib/chat-window.ts`), odpowiada modelem ustawionym dla `ask()` i ma dzienny limit pytań od północy. Prompt składa `supabase/functions/assistant/prompt.ts` z warstw: wspólne zasady, zasada dla rodzaju zadania (przy pytaniach zamkniętych bez zaznaczonych odpowiedzi), kurs z tematami do bieżącej lekcji i notatką `assistant.md`, zadanie z podpowiedziami (i tym, ile uczeń już otworzył), kod ucznia i wynik ostatniego sprawdzenia. Zadanie, kurs i podpowiedzi funkcja czyta z bazy, a strona wysyła tylko rozmowę, kod i wynik. Uczeń widzi swoje limity na stronie Konto (`lms_my_ai_usage()`).

## Lokalnie

`.env` (nie trafia do gita):

```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # tylko dla sync-content
```

```
npm install
npm run dev       # http://localhost:4321/kurs-programowania/
npm test          # testy sprawdzarki (Python) i Vitest (schematy, prompty, Markdown, dostawcy modeli)
npm run check     # astro check
```

## Publikacja

`git push` na `main`: GitHub Actions uruchamia testy (Python i Vitest), `astro check`, buduje stronę i publikuje na Pages. W repo: Settings → Secrets and variables → Actions → Variables: `PUBLIC_SUPABASE_URL` i `PUBLIC_SUPABASE_ANON_KEY` (publiczny z założenia, dane chroni RLS).

## Ograniczenia

- Sprawdzanie odbywa się w przeglądarce, więc uczeń znający narzędzia deweloperskie mógłby podrobić wynik. Dlatego panel pokazuje też kod każdej próby.
- Uczeń z dostępem do zadania widzi jego testy (przychodzą do przeglądarki). Wzorcowe rozwiązania są tylko w prywatnym folderze.
- `input()` czyta z pola „Dane dla input()”, a nie interaktywnie (GitHub Pages nie pozwala ustawić nagłówków potrzebnych do interaktywnego wejścia).
- Uruchamianie kodu w przeglądarce jest tylko dla Pythona. Kurs w innym języku (np. C#) będzie potrzebował osobnego mechanizmu.
