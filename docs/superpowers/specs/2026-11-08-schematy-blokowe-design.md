# Schematy blokowe w „Krok po kroku”

Data: 2026-11-08. Status: projekt do akceptacji.

## Cel

Ręczne rysunki krokowe (`lessons/img/_rysunki.py`) są dla pętli mało czytelne: kroki sklejają kilka obrotów, a każdy rysunek trzeba robić osobno. Platforma ma sama rysować schemat blokowy przykładu i animować go według prawdziwego wykonania programu, tak jak dziś „Krok po kroku” pokazuje kod i zmienne.

Odbiorca: licealista, często na telefonie.

## Decyzje

- Schemat to drugi widok w „Krok po kroku”: przełącznik **Kod / Schemat** przy każdym przykładzie ```` ```python krok ````, także po „Zmień i uruchom”. Autor lekcji nic nie dopisuje.
- Pierwsza wersja zna: zwykłe linijki, `if`/`elif`/`else` (także zagnieżdżone), `while`, `for`, `break`, `continue`, `def`, `return`, wywołania funkcji ucznia (także funkcja w funkcji i rekurencja).
- Na schemacie: wartość warunku w rombie („3 > 0 → tak”) z podświetloną wybraną strzałką oraz licznik obrotów przy pętli (przy `for` też bieżący element). Obok: zmienne i ekran.
- Funkcje to osobne schematy obok programu (na telefonie pod nim); przy wywołaniu znacznik przechodzi do schematu funkcji, po `return` wraca.
- Podejście: Python (`ast`) buduje drzewo bloków, TypeScript sam liczy układ (bez bibliotek do grafów) i rysuje SVG klasami platformy. Odrzucone: dagre/Mermaid (ciężkie, gorszy układ pętli, obcy styl) i schematy liczone przy `sync-content` (nie działałyby po „Zmień i uruchom”).
- Ręczne rysunki zostają tam, gdzie tłumaczą coś innego niż przebieg programu (pudełka zmiennych, typy, drzewa działań). Rysunek `petla` w lekcji 5 zastąpi schemat.

## Architektura

```
public/py/checker.py      trace(): + "flow" (drzewo bloków) i ramki funkcji w krokach
src/lib/flowchart/
  model.ts                typy: FlowBlock, FlowProgram, LaidOutNode, Edge
  layout.ts               drzewo bloków → pozycje węzłów i krawędzi (czyste funkcje, bez DOM)
  progress.ts             kroki trace → stan schematu w kroku i (węzeł, wybrana krawędź, obrót, wartość warunku)
  render.ts               układ → SVG; aktualizacja podświetleń w kroku
src/lib/stepper.ts        przełącznik Kod / Schemat, wspólny numer kroku
src/styles/lesson-widgets.css   wygląd schematu
tests/test_checker.py     testy flow i ramek
tests/flowchart/*.test.ts testy layout.ts i progress.ts (node --test)
```

Każdy moduł TypeScript ma jedno zadanie: `layout` nie zna DOM ani kroków, `progress` nie zna pozycji, `render` nie liczy niczego poza rysowaniem.

## Część 1: dane z Pythona

`trace(code, stdin)` zwraca dodatkowo `flow`; istniejące pola zostają, więc obecny widok kodu działa bez zmian.

```json
{"main": [
   {"kind": "stmt",  "line": 1, "text": "seconds = 3"},
   {"kind": "while", "line": 2, "test": "seconds > 0", "body": [
       {"kind": "stmt", "line": 3, "text": "print(seconds)", "io": "out"},
       {"kind": "stmt", "line": 4, "text": "seconds -= 1"}]},
   {"kind": "stmt",  "line": 5, "text": "print(\"Szczęśliwego Nowego Roku!\")", "io": "out"}],
 "functions": {"double": {"line": 7, "params": "n", "body": [
       {"kind": "return", "line": 8, "text": "n * 2"}]}}}
```

Rodzaje bloków:

| kind | pola |
|---|---|
| `stmt` | `line`, `text`, `io`: `"in"` (jest `input(`), `"out"` (zaczyna się od `print(`) albo brak, `calls`: lista nazw funkcji ucznia wołanych w linijce |
| `if` | `branches`: `[{line, test, body}]`; `elif` to kolejna gałąź, `else` ma `test: null` |
| `while` | `line`, `test`, `body` |
| `for` | `line`, `target`, `iter`, `body` |
| `break`, `continue` | `line` |
| `return` | `line`, `text` (może być pusty), `calls` |

- `text` to linijka źródła bez wcięcia; `test`, `iter` to fragment z `ast.get_source_segment`. Skracanie do wyświetlenia robi `render` (pełny tekst w `<title>`).
- `else` przy `while`/`for`, `try`, `with`, `class`, `match`, `async`, `lambda` jako osobna linijka, `global`/`nonlocal`, funkcja w funkcji, dekoratory: `flow` = `null`.
- Ponad 40 bloków łącznie: `flow` = `null` (schemat byłby nieczytelny).
- Linijka z kilkoma instrukcjami (`a = 1; b = 2`) to jeden blok `stmt`.

Kroki dostają trzy pola:

- `frame`: nazwa funkcji, w której jest wykonywana linijka, albo `null` dla programu,
- `locals`: zmienne tej funkcji w formacie `variables` (dla programu pusta lista; `variables` dalej opisuje program),
- `depth`: głębokość wywołań (0 to program).

Śledzenie: `on_call` już włącza śledzenie linijek w ramkach z pliku ucznia; `snapshot` czyta `frame.f_code.co_name` i `frame.f_locals` bieżącej ramki. Linijka `return` daje krok w ramce funkcji; następny krok jest już w ramce wołającej.

## Część 2: układ i wygląd

Kształty (tylko klasy platformy, jasny i ciemny motyw):

| blok | kształt |
|---|---|
| `stmt` | prostokąt |
| `stmt` z `io` | równoległobok (wejście/wyjście, jak w szkolnych schematach) |
| `if`, `while` | romb |
| `for` | sześciokąt: „dla każdego `target` w `iter`” |
| `break`, `continue`, `return` | mała zaokrąglona etykieta |
| start / koniec | owale „start” i „koniec” (w funkcji: `def nazwa(params)` i „powrót”) |

Etykiety strzałek po polsku: „tak” / „nie” przy warunkach, „wróć” przy powrocie pętli, „następny” i „koniec listy” przy `for`.

Reguły układu (rekurencyjnie, każdy fragment zwraca prostokąt z wejściem u góry i wyjściem na dole, na wspólnej osi):

- sekwencja: fragmenty jeden pod drugim, wyrównane do osi,
- `if`: gałąź „tak” pod rombem, kolejne gałęzie (`elif`, `else` albo pusta droga) w prawo; wszystkie zbiegają się pod najniższą,
- `elif` rysowany jako kolejny romb na drodze „nie” poprzedniego (drabinka, jak w lekcji 3),
- `while` / `for`: blok pod warunkiem, powrót lewą stroną do wejścia warunku, wyjście „nie” prawą stroną w dół pod całą pętlę,
- `break`: strzałka do wyjścia najbliższej pętli; `continue`: do jej warunku; `return`: do owalu „powrót” funkcji,
- funkcje: osobne schematy w ramkach; szeroki kontener (≥ 720 px): obok programu, wąski: pod nim; blok z wywołaniem ma znaczek „↗ nazwa”.

Rozmiar: szerokość z najszerszego zagnieżdżenia; tekst bloku najwyżej 28 znaków (dłuższy skracany „…”); skala w dół tylko do wielkości tekstu ok. 12 px, dalej przewijanie w poziomie w ramce schematu (strona się nie przewija).

Panel (pod schematem, na szerokim kontenerze obok): zmienne jako pudełka w kolorach typów; zmienna zmieniona w tym kroku ma obwódkę akcentu; przy funkcjach dwie grupy: „program” i „double(n)” (przy rekurencji tylko bieżące wywołanie i program). Pod zmiennymi ekran jak w widoku kodu.

## Część 3: animacja i sterowanie

- Ten sam numer kroku co w widoku kodu: przełączenie Kod/Schemat zostawia ucznia w tym samym miejscu. Wybór widoku zapamiętany w `localStorage` (jak „Pokaż liczenie w linijce”), z try/catch.
- Przyciski z `step-controls.ts` (Wstecz, Dalej, Odtwórz, Od początku, strzałki na klawiaturze) bez zmian.
- `progress.ts` dla każdego kroku liczy: bieżący węzeł (`frame`, `line` → węzeł), krawędź, którą przyszedł znacznik, wartość warunku (ostatnia wartość `True`/`False` z `parts` linijki warunku; przy `for` wartość zmiennej pętli z następnego kroku), numer obrotu każdej pętli (wejście do linijki pętli z jej bloku zwiększa licznik; wejście z zewnątrz zeruje).
- `render` w kroku: bieżący węzeł `accent-box`, znacznik (kropka) przesuwa się po krawędzi od poprzedniego węzła (ok. 400 ms; przy `prefers-reduced-motion` od razu); w rombie tekst warunku zamienia się na „3 > 0 → tak”, wybrana strzałka pogrubiona i w kolorze akcentu; przy pętli plakietka „obrót 2” (przy `for` „x = 'kot'”).
- Krok wstecz liczy stan od zera dla kroku i−1 (bez animacji), więc nie ma stanu do cofania.
- Przy wywołaniu znacznik przelatuje do ramki funkcji, przy `return` wraca do bloku z wywołaniem (który dalej jest bieżący, dopóki linijka się nie skończy).

## Przypadki brzegowe

- `flow` = `null`: przełącznik się nie pokazuje.
- Błąd w trakcie (np. `ZeroDivisionError`): ostatni węzeł z obwódką błędu, komunikat jak w widoku kodu.
- `TooManySteps` (ponad 500 kroków): schemat pokazuje dostępne kroki i ten sam komunikat.
- Linijka pętli bez parts z wartością logiczną (np. `while True`): w rombie samo „tak”.
- Dwa bloki na tej samej linijce (`if x: y = 1`): krok wskazuje romb; blok w środku dostaje podświetlenie razem z nim.

## Testy

- `tests/test_checker.py`: `flow` dla sekwencji, `if/elif/else`, zagnieżdżonego `if`, `while` z `break`/`continue`, `for`, funkcji z `return`, rekurencji; `null` dla `try` i dla programu ponad 40 bloków; `frame`/`locals`/`depth` w krokach funkcji; istniejące testy trace bez zmian.
- `tests/flowchart/layout.test.ts` (`node --test --experimental-strip-types`, bez nowych zależności): brak nakładania się węzłów, wszystkie krawędzie zaczynają się i kończą na węzłach, wymiary rosną z zagnieżdżeniem.
- `tests/flowchart/progress.test.ts`: na zapisanych wynikach trace (odliczanie, bateria, PIN z `break`, `for`, funkcja): bieżący węzeł, wartość warunku i numer obrotu w każdym kroku.
- Ręcznie: przykłady z lekcji 3–5 na stronie (jasny i ciemny motyw, telefon), wszystkie przykłady lekcji przechodzą `sync-content --dry-run`.
- `npm test` uruchamia oba zestawy.

## Poza zakresem pierwszej wersji

- Klasy, `try`, `with`, `match`, generatory, funkcje zagnieżdżone, dekoratory.
- Edycja schematu, eksport do pliku, schemat w zadaniach (tylko lekcje).
- Inne języki niż Python.

## Wdrożenie

Gałąź `feat/schematy` od `main`. Strona wdraża się z `main`, więc schematy trafią do uczniów dopiero po merge i push (osobna decyzja). Potem w lekcji 5 rysunek `petla` zastępuje zdanie zachęcające do widoku „Schemat”.
