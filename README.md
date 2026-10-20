# Kurs programowania

Platforma do korepetycji z programowania: lekcje, zadania sprawdzane automatycznie w przeglądarce, panel nauczyciela. Na razie kurs „Python od zera”, w przyszłości kolejne kursy i poziomy.

Adres: https://mariuszpatek.github.io/kurs-programowania/

Interfejs jest po polsku, kod (TypeScript, Python, SQL) po angielsku.

## Jak to działa

- **Dostęp tylko po zalogowaniu.** Logowanie linkiem z maila (bez hasła). Konto zakłada nauczyciel, strona sama kont nie tworzy.
- **Treść nie jest w tym repo.** Lekcje, zadania i testy są w Supabase. Reguły RLS wydają uczniowi tylko kursy, na które jest zapisany, i tylko lekcje do numeru `unlocked_through`. Zbudowana strona to pusta aplikacja, która bez logowania nic nie pokaże.
- **Python działa w przeglądarce** (Pyodide w Web Workerze). Program działający dłużej niż 5 s jest zatrzymywany.
- **Próby** (każde „Sprawdź”) trafiają do `lms_attempts`. Nauczyciel widzi je w panelu `/teacher/`.

## Treść kursów

Treść leży w prywatnym folderze `../korepetycje_python/platforma/` (inny można ustawić w `.env` jako `CONTENT_DIR`). Zasady pisania lekcji (nazwy po angielsku, bez spoilerów, jak pisać notatki) są w `platforma/JAK-PISAC.md`. Każdy podfolder to jeden kurs:

```
python-podstawy/
  course.yaml                       slug, title, language, level, description
  tutor-prompt.md                   prompt korepetytora AI; {{topics}} = tematy lekcji do bieżącej
  lessons/01.md                     frontmatter: number, title, topics
  lessons/01.teacher.md             notatki tylko dla nauczyciela (plan, pytania, notatki przy fragmentach lekcji)
  lessons/img/nazwa.svg             rysunki; generator: lessons/img/_rysunki.py
  tasks/01/01-nazwa.md              frontmatter: title, number, kind (code | predict), in_class?, starter_code?, predict_code?, hints?
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

### Krok po kroku (`src/lib/stepper.ts`)

Przykład ```` ```python krok ```` uruchamia się w przeglądarce (`checker.trace`): po każdej linijce widać zmienne z typami i to, co jest na ekranie. Z „Pokaż liczenie w linijce” każda linijka rozkłada się na wartości, jak „step into” w Thonny (`age = int('16')` → `age = 16`). Przyciski Wstecz / Dalej / Odtwórz są wspólne z rysunkami (`src/lib/step-controls.ts`).

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

Docstring testu to nazwa widoczna dla ucznia, a komunikat w `assert` to podpowiedź po porażce (po polsku). `input()` wypisuje zachętę i wpisaną wartość, tak jak terminal.

## Uczniowie

Panel `/teacher/` → „Dodaj ucznia”: e-mail, kurs i numer lekcji, do której ma dostęp. Przyciski −/+ przy uczniu odblokowują kolejne lekcje. Konto zakłada edge function `lms-invite`.

## Supabase

Projekt współdzielony z Co Zabrać (`CoZabracMobile`), dlatego wszystko ma prefiks `lms_`. Migrację `supabase/migrations/…_lms_init.sql` uruchamia się ręcznie w SQL Editorze, nie przez `supabase db push` (historia migracji należy do Co Zabrać). Nauczyciela dopisuje się raz:

```sql
insert into public.lms_teachers (email) values ('twoj@email');
```

W Authentication → URL Configuration → Redirect URLs muszą być `https://mariuszpatek.github.io/kurs-programowania/**` i `http://localhost:4321/**`.

Edge functions:

```
supabase functions deploy lms-invite --project-ref egwhzrxgbbmjdnwphmfj
supabase functions deploy assistant --project-ref egwhzrxgbbmjdnwphmfj   # asystent AI, opcjonalnie
supabase secrets set OPENROUTER_API_KEY=... --project-ref egwhzrxgbbmjdnwphmfj
```

Asystent pokazuje się dopiero przy `PUBLIC_ASSISTANT=1`. Sekrety opcjonalne: `ASSISTANT_MODEL` (domyślnie `anthropic/claude-haiku-4.5`), `ASSISTANT_DAILY_LIMIT` (domyślnie 40).

## Lokalnie

`.env` (nie trafia do gita):

```
PUBLIC_SUPABASE_URL=https://egwhzrxgbbmjdnwphmfj.supabase.co
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # tylko dla sync-content
```

```
npm install
npm run dev       # http://localhost:4321/kurs-programowania/
npm test          # testy sprawdzarki
```

## Publikacja

`git push` na `main`: GitHub Actions uruchamia testy sprawdzarki, buduje stronę i publikuje na Pages. W repo: Settings → Secrets and variables → Actions → Variables: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` (publiczny z założenia, dane chroni RLS) i opcjonalnie `PUBLIC_ASSISTANT=1`.

## Ograniczenia

- Sprawdzanie odbywa się w przeglądarce, więc uczeń znający narzędzia deweloperskie mógłby podrobić wynik. Dlatego panel pokazuje też kod każdej próby.
- Uczeń z dostępem do zadania widzi jego testy (przychodzą do przeglądarki). Wzorcowe rozwiązania są tylko w prywatnym folderze.
- `input()` czyta z pola „Dane dla input()”, a nie interaktywnie (GitHub Pages nie pozwala ustawić nagłówków potrzebnych do interaktywnego wejścia).
- Uruchamianie kodu w przeglądarce jest tylko dla Pythona. Kurs w innym języku (np. C#) będzie potrzebował osobnego mechanizmu.
