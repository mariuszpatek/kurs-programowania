# Wygodniejsze pisanie kodu: `input()` w konsoli, pełny ekran, A−/A+, Ctrl+S

Zatwierdzone w rozmowie 2026-11-11.

## Cel

Pisanie kodu w zadaniach („Uruchom”, piaskownica) i w lekcji („Zmień i uruchom”) ma przypominać
prawdziwy edytor: program pyta o dane w konsoli, edytor da się rozciągnąć na cały ekran, a kod
powiększyć.

## 1. `input()` w konsoli, z prawdziwą pauzą programu

- Gdy program woła `input()`, a w polu „Dane dla input()” nie ma już linijek, wątek Pythona
  (`worker.ts`) wysyła stronie dotychczasowy wynik (z pytaniem programu) i czeka na odpowiedź
  zablokowany na synchronicznym zapytaniu do service workera, tak jak dziś czeka na model przy `ask()`.
- W oknie wyniku, w linijce z pytaniem, pojawia się pole. Enter: strona oddaje odpowiedź service
  workerowi, ten zapytaniu wątku, program rusza dalej. Obok przycisk „Zatrzymaj”: kończy program
  (bez restartu Pythona), w wyniku „(program zatrzymany)”.
- Limit czasu (5 s) liczy tylko liczenie: czekanie na ucznia go wstrzymuje, po odpowiedzi biegnie od nowa.
- Pole „Dane dla input()” zostaje, zwinięte: jego linijki idą do programu najpierw, potem program
  pyta w konsoli. Potrzebne do „Krok po kroku”; 12 zadań w treści do niego odsyła.
- Tylko „Uruchom” (zadanie, piaskownica, „Zmień i uruchom”). „Sprawdź”, „Co się wypisze”
  i „Krok po kroku” bez zmian.

### Service worker `public/input-sw.js`

- Rejestracja w `Layout.astro` na każdej stronie (też logowania), zakres `/kurs-programowania/`.
- Obsługuje tylko adresy z `__input__/`. Pozostałe zapytania przepuszcza bez `respondWith`, więc
  strony i pliki ładują się jak bez niego.
- `__input__/ping` → 200. `__input__/read?key=…` → odpowiedź, gdy strona ją przyśle
  (`postMessage({ key, answer })`), albo 204 po 25 s (wątek pyta wtedy jeszcze raz).
  Odpowiedź przysłana, zanim wątek o nią zapytał, czeka w pamięci.
- `answer: null` = „Zatrzymaj”.

### Bez service workera

Wątek przy starcie robi `ping`. Gdy nie dostanie 200 (pierwsze wejście, zanim service worker
zacznie działać, przeglądarka go blokuje, Safari nie przepuszcza), `input()` działa po staremu:
po wyczerpaniu pola błąd EOFError z komunikatem o polu „Dane dla input()”.

### `checker.py`

- `INPUT_BACKEND` (jak `LLM_BACKEND`): funkcja dostaje dotychczasowy wynik i zwraca odpowiedź
  albo `None` (zatrzymaj). Ustawiana tylko dla „Uruchom” w trybie z konsolą.
- Zatrzymanie to `StoppedByStudent(BaseException)`, więc `except Exception` w kodzie ucznia go nie
  łapie. `run` zwraca wtedy wynik bez błędu i `stopped: true`.

## 2. Pełny ekran

- Przycisk „Pełny ekran” na pasku edytora (zadanie, piaskownica, „Zmień i uruchom”). Wyjście:
  ten sam przycisk albo Esc. Tam, gdzie się da, także prawdziwy pełny ekran przeglądarki
  (`requestFullscreen`); bez niego (iPhone) okno wypełnia sam układ.
- Zadanie: trzy kolumny: treść z podpowiedziami (przycisk „«” zwija ją do wąskiego paska), edytor,
  wynik. Kodek pod treścią, zwinięty (`<details>`; poza pełnym ekranem otwarty). Wyniki
  sprawdzenia pod edytorem i wynikiem. Poniżej 900 px wynik pod edytorem.
- Układ zmieniają tylko klasy CSS (`.fullscreen` na `.task-layout`, `.workspace`, `.playground`),
  bez przenoszenia elementów: edytor, rozmowa z Kodkiem i stan zostają.
- „Zmień i uruchom”: edytor po lewej, wynik po prawej. „Krok po kroku” ukryte w pełnym ekranie
  (rysuje się pod przykładem, poza oknem).

## 3. Drobiazgi

- A− / A+ na pasku edytora: wielkość kodu w edytorach i w oknie wyniku (12–22 px), zmienna CSS
  `--code-size`, zapamiętana w `localStorage` (`kurs:code-size`, w try/catch).
- Ctrl+S (Cmd+S) w edytorze: zamiast okna „Zapisz stronę” status „Zapisane w tej przeglądarce”
  (szkic i tak zapisuje się przy każdej zmianie).

## Testy

- `tests/test_checker.py`: odpowiedzi z `INPUT_BACKEND`, kolejność pole → konsola, zatrzymanie,
  `except Exception` nie łapie zatrzymania, bez backendu EOFError jak dotąd.
- Przeglądarka (gstack, Chromium, zbudowana strona na tymczasowej stronie podglądu): pętla
  z `input()`, „Zatrzymaj”, limit czasu nie ucieka przy czekaniu, pełny ekran w zadaniu
  i w „Zmień i uruchom”, A−/A+, Ctrl+S, układ na szerokości telefonu.
- Safari: do sprawdzenia przez Mariusza (iPhone/Mac); bez service workera ma działać stare pole.

## Poza zakresem

- Poprawki treści 12 zadań, które odsyłają do pola „Dane dla input()” (osobno, skill `dydaktyka`).
- `input()` w „Krok po kroku”.
