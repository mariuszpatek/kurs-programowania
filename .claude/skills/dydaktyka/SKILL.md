---
name: dydaktyka
description: Lista kontrolna dydaktyki do lekcji i zadań kursów w korepetycje_python/platforma. Używaj przy pisaniu nowej lekcji, przy przeglądzie istniejącej („przejrzyj lekcję N dydaktycznie”) i przy układaniu zadań, podpowiedzi, notatek nauczyciela albo `assistant.md` (notatki dla Kodka, asystenta AI przy zadaniach).
---

# Dydaktyka lekcji

Format plików, nazwy i walidacja są w `platforma/JAK-PISAC.md`; ten skill ich nie powtarza.
Tu jest to, co sprawia, że uczeń faktycznie się uczy. Odbiorca: licealista, zajęcia 1:1 po ok. 60 min.

## Dwa tryby

- **Pisanie:** najpierw plan (działy, przykłady, zadania, typowe błędy), potem treść. Przed
  oddaniem przejdź listę kontrolną na końcu.
- **Przegląd:** przeczytaj lekcję, notatki i zadania, potem raport (format na końcu).
  Nic nie zmieniaj bez zgody.

## 0. Język: przystępnie i po polsku

Lekcję czyta szesnastolatek, często sam, wieczorem. Ma ją zrozumieć bez nauczyciela obok.

- Krótkie zdania. Jedna myśl w zdaniu. Gdy zdanie ma trzy przecinki, podziel je.
- Do ucznia na „Ty”, jak w rozmowie: „Kliknij”, „Sprawdź”, „Jak myślisz…?”.
- Najpierw konkret, potem nazwa: przykład z baterią, dopiero potem słowo „licznik”.
- Słowa codzienne zamiast fachowych. Fachowe pojawia się raz, w nawiasie: „obrót (fachowo:
  iteracja)”, potem już tylko codzienne.
- Naturalna polszczyzna, bez kalk z angielskiego. Zamiast „przewidź” pisz „zgadnij” albo
  „jak myślisz, co się wypisze?”; zamiast „zaadresować problem” pisz „rozwiązać”; zamiast
  „wykonaj iterację” pisz „pętla obraca się”.
- Zero ozdobników i nadęcia („kluczowe”, „niezwykle ważne”, „przyjrzyjmy się”). Fakt wystarczy.
- Przeczytaj tekst na głos. Jeśli brzmi jak podręcznik albo jak czat z AI, napisz prościej.
- **Na koniec zawsze skill `humanizer`** w trybie plikowym na lekcji, zadaniach, podpowiedziach
  i notatkach nauczyciela. Zmienia tylko prozę; kod, bloki `output`, YAML i polskie cudzysłowy
  „” zostają. Przy przeglądzie język to osobny punkt raportu.

## 1. Otwarcie lekcji

- Pierwsze zadanie lekcji (`in_class`, zwykle predict) albo pierwsze pytania w notatkach to
  **powtórka z pamięci** tego, czego dzisiejsza lekcja potrzebuje, a nie wszystkiego z poprzedniej.
  Uczeń odpowiada bez zaglądania. Pytanie typu „co wypisze” albo „dokończ kod” jest lepsze niż
  „czy pamiętasz, co to `and`?”.
- Pierwszy dział łączy stare z nowym wprost: „umiesz już X, dziś X powtórzy się / połączy z Y”.
- Jedno zdanie celu, czyli co uczeń będzie umiał zrobić, a nie co będziemy robić.

## 2. Każdy dział: zgadnij, uruchom, zbadaj, zmień, napisz

Kolejność z metody PRIMM, przełożona na platformę:

1. **Zgadnij.** Przed przykładem `krok` pada pytanie: „Jak myślisz, co się wypisze?”, „Ile razy?”,
   „Którędy pójdzie program?”. W lekcji jako zdanie dla ucznia, w notatce: „zapytaj, zanim
   uruchomisz…” z odpowiedzią, która ma paść. Blok `output` pod kodem zdradza odpowiedź, więc przy
   pytaniu „zgadnij” wynik chowamy w zwijanym bloku (składnia niżej, „Zwijane wyniki i odpowiedzi”).
2. **Uruchom.** „Krok po kroku” tam, gdzie widać coś, czego nie widać w samym wyniku
   (pominięte linijki, powrót pętli, zmiana zmiennej).
3. **Zbadaj.** Jedno pytanie „dlaczego” w miejscu, gdzie łatwo się pomylić: nie „co robi linijka 3”,
   tylko „dlaczego bateria spadła do 10, a nie do 20”. Uczeń ma wyjaśnić swoimi słowami.
4. **Zmień.** „Zmień i uruchom” z konkretnym poleceniem: co zmienić i czego się spodziewać
   („zmień 15 na 30; zgadnij najpierw, ile godzin wyjdzie”). Samo „pobaw się” nie działa.
5. **Napisz.** Karta „Sprawdź się” z zadaniem, które wymaga tego działu.

Jedna nowa rzecz na dział. Przykład używa tylko tego, co już było (wyjątek: „Dla ciekawych”).

### Zwijane wyniki i odpowiedzi

Każde pytanie do ucznia w lekcji (zgadnij wynik, polecenie „zmień”, pytanie-zawias, rozgrzewka)
ma odpowiedź w lekcji, zwiniętą pod pytaniem. Uczeń w domu też może sprawdzić się sam.
Lekcje przepuszczają HTML, więc wystarczy `<details>`. Puste linijki wokół bloku kodu są
obowiązkowe, inaczej Markdown w środku się nie zamieni:

    <details><summary>Pokaż wynik</summary>

    ```output
    5
    4
    ```

    Jedno zdanie, dlaczego tak (opcjonalnie).

    </details>

- `Pokaż wynik` pod przykładem kodu, `Pokaż odpowiedź` pod pytaniem albo poleceniem.
- Odpowiedź do polecenia „zmień” to liczba, krótkie wyjaśnienie albo gotowy kod (```` ```python krok ````).
- Nie zwijaj wszystkiego: przykład, przy którym nie ma pytania (np. chatbot z danymi
  w `krok`), zostaje z otwartym wynikiem.

## 3. Przykłady

- Pierwszy przykład nowej rzeczy jest pełny i działa. Tekst pod nim mówi, **dlaczego** tak, a nie
  tylko co się stało.
- **Przykład z błędem** dopiero po poprawnym. Jeden błąd na przykład i to błąd, który uczniowie
  naprawdę robią (lista w notatkach nauczyciela). Najpierw zagadka („ten program miał odliczać;
  znajdź błąd, zanim przeczytasz dalej”), potem wyjaśnienie. Uczeń ma znaleźć błąd, wyjaśnić,
  dlaczego to błąd, i poprawić. Samo „znajdź” to za mało.
- Sytuacje z życia licealisty (telefon, gry, kieszonkowe, social media, szkoła). AI wtedy, gdy
  naprawdę pasuje do mechanizmu (czat to pętla, model losuje słowa), a nie dla ozdoby. Nie wciskaj
  AI na siłę: abstrakcyjny „model, którego błąd spada o połowę” był dla Mariusza niejasny.
- **Wzór dobrego przykładu: „Kartka do Księżyca” (lekcja 5).** Kartka ma 0,1 mm, każde złożenie
  podwaja grubość. Ile złożeń da metr (14), a ile Księżyc (42)? Taki przykład Mariusz chce:
  konkretna rzecz z ręki, jedno proste pytanie „ile?”, wynik, który zaskakuje, a da się go
  sprawdzić. Polecenie „zmień” zmienia jedną liczbę i daje drugie zaskoczenie. Wielkości podawaj
  w jednostkach, które uczeń czuje (metry, km), a przeliczenie zrób w programie (`goal_km * 1000000`,
  `round(thickness / 1000, 1)`), a nie w liczbie z dwunastoma zerami w treści.
- Wstęp lekcji i działu prosty, z doświadczenia ucznia („masz wypisać liczby od 1 do 100: sto
  linijek `print`”). Zawiła historia z datami i technicznymi szczegółami (Zune) się nie sprawdziła.
- Każdy fakt (historia, liczby, cytat) musi dać się sprawdzić. Gdy nie masz pewności, pomiń go
  albo oznacz w notatce „do sprawdzenia”.
- Rysunek tylko wtedy, gdy pokazuje ruch albo stan, którego tekst nie oddaje (kroki, pudełka, drogi).
- **Memy od czasu do czasu są mile widziane**: jeden, najwyżej dwa na lekcję, przy temacie, który
  naprawdę ilustrują (Bart piszący karne zdanie na tablicy przy wstępie do pętli). Zasady:
  - cudzy obrazek jako link do samego pliku obrazka w zdaniu lekcji, nie kopia w `img/`
    i nie strona sklepu (Displate, plakaty); przed wstawieniem obejrzyj go, bez wulgaryzmów,
  - żart z kodem w innym języku przepisz na Pythona i daj w bloku ```` ``` ```` bez nazwy
    języka, żeby nie miał „Zmień i uruchom” (taki kod zwykle się nie uruchomi),
  - bez memów z kontrowersyjnym tłem (papież 2137, patostreamy),
  - polskie nawiązania mile widziane, ale licealista zna raczej Kevina i Shreka niż Bareję.
  Przebiegu programu (pętla, `if`) nie rysuj ręcznie: ```` ```python schemat ```` pokazuje pod
  przykładem schemat blokowy, po którym idzie kropka. Pod spodem pytanie do schematu („ile razy
  romb da »tak«?”) z odpowiedzią w `<details>`, a nie opis animacji słowami.

## 4. Pytanie-zawias

W połowie lekcji, przed zadaniami samodzielnymi, jedno zamknięte pytanie (A/B/C/D albo
„co się wypisze” z jedną linijką), na które uczeń odpowiada w mniej niż 2 minuty.

- W lekcji jako quiz do klikania: lista `- [ ]` / `- [x]`, pod każdą odpowiedzią wcięta linijka
  z wyjaśnieniem (składnia w JAK-PISAC). Wyjaśnienie złej odpowiedzi mówi, w czym tkwi błąd.
- Każda zła odpowiedź odpowiada **konkretnemu błędowi** w rozumowaniu. Nauczyciel po odpowiedzi
  wie nie tylko, że uczeń się myli, ale też w czym.
- Dobrej odpowiedzi nie da się trafić złym rozumowaniem.
- W notatkach klucz: „A: dobrze. B: myśli, że warunek sprawdza się w trakcie obrotu → wróć do
  baterii. C: …” i decyzja: dobrze → zadania; źle → co powtórzyć.

## 5. Zadania

Kolejność na liście (na lekcji i w domu, od najłatwiejszych):

1. zgadywanie wyniku, bez pisania kodu. Na start `kind: choice`: kilka małych pytań, każde to
   jedna pętla albo para (`if` kontra `while`) z odpowiedziami do kliknięcia i wyjaśnieniem przy
   każdej. Nie sklejaj kilku programów w jeden długi `predict_code`: uczeń gubi się, która linijka
   wyniku jest od czego. `kind: predict` (wpisywanie wyniku) dopiero, gdy uczeń już to umie,
   i wtedy z pustymi linijkami między częściami i podpisem w `print` (`print(f"a = {a}")`),
2. bliskie przykładowi: ta sama budowa, inna sytuacja i inne liczby,
3. ta sama umiejętność w innym opakowaniu,
4. łączenie z wcześniejszymi lekcjami (np. pętla + `.lower()` + `and`),
5. dalekie albo „dla chętnych”: wygląda inaczej, wymaga tego samego.

Do tego w każdej lekcji:

- co najmniej 2 zadania celujące w typowe błędy, każdy błąd jako `bad-*`,
- „znajdź błędy” z kodem startowym (błąd składni, błąd logiczny i błąd na granicy),
- jedno zadanie **„który sposób?”**: uczeń musi zdecydować, czego użyć (`if` czy `while`, `and` czy
  `if` w `if`), a nie tylko użyć tego, co było dziś,
- 1–2 zadania domowe, w których wraca temat sprzed 2–3 lekcji (powtórka rozłożona w czasie),
- opcjonalnie zadanie z kodem startowym, w którym brakuje końcówki (uczeń dopisuje ostatni krok;
  im dalej w kursie, tym mniej gotowego kodu),
- na koniec listy jedno zadanie **„Wytłumacz koledze”** (`kind: explain`, beta): uczeń tłumaczy
  swoimi słowami 3–4 najważniejsze pojęcia lekcji Robciowi, którego gra AI. Robcio dopytuje i nie
  podpowiada, a podsumowanie ocenia każde pojęcie. Wzór: `tasks/05/13-wytlumacz.md` i jego
  `.teacher.md`.
  - Treść: krótki wstęp i ponumerowana lista pojęć w kolejności z lekcji, każde jako pytanie
    („Jak działa…”, „Czym się różni…”, „Po co…”), plus zdanie, żeby nie zaglądać do lekcji.
  - Klucz w `.teacher.md` (obowiązkowy, uczeń go nie widzi) przy każdym pojęciu: **Musi paść**
    (to decyduje o zaliczeniu), **Dobrze, jeśli padnie**, **Typowe błędne przekonania** (z sekcji
    „Typowe błędy w tej lekcji”) i **O co dopytać** (konkretne pytania typu „a co jeśli…?”).
  - Tylko pojęcia z tej i wcześniejszych lekcji. Poziom rozmowy funkcja bierze z `topics:` lekcji,
    więc `topics:` mają być pełne i aktualne.
  - Prompty Robcia i podsumowania są wspólne (`supabase/functions/explain/prompt.ts` w kurs-programowania);
    lekcja zmienia tylko klucz.

## 6. Podpowiedzi (`hints:`)

Trzy stopnie, od ogólnej do konkretnej:

1. **Kierunek:** w którą stronę iść, który dział lekcji („zajrzyj do tabelki…”, „opisz słowami,
   kiedy program ma pytać jeszcze raz”).
2. **Przyczyna:** gdzie zwykle jest błąd i dlaczego („czy przy 3 warunek…?”).
3. **Krok:** co konkretnie zrobić, ale uczeń musi to sam zapisać.

Każda podpowiedź robi jedną rzecz i nigdy nie zawiera gotowej linijki rozwiązania. Pierwsza nie
zdradza budowy rozwiązania. Celuje w przyczynę błędu, a nie w objaw („spróbuj jeszcze raz” nic
nie daje).

## 7. Ile naraz

- Nowa składnia w przykładzie: najwyżej jedna. Reszta znana.
- Przykład z wieloma znanymi elementami naraz (np. pętla + `in` + `elif` + `.strip()`) uprość,
  a resztę przenieś do polecenia „Zmień i uruchom”.
- Wyjaśnienie stoi przy kodzie, którego dotyczy, bez „jak widać wyżej”.
- Ramki (`TIP`, `WARNING`…) tylko na rzeczy, które uczeń ma zapamiętać. Jeśli jest ich więcej
  niż jedna na dział, prawdopodobnie któraś jest zbędna.
- Zadanie, które wymaga naraz trzech nowych rzeczy, rozbij na dwa.

## 8. Notatki nauczyciela

- Plan na 60 minut: tabela z czasem i zadaniem na lekcji przy każdym bloku.
- Przy każdym dziale: o co zapytać **przed** uruchomieniem i jaka odpowiedź ma paść.
  Pełne zdania (zasada z JAK-PISAC).
- Sekcja „Typowe błędy w tej lekcji”: lista, z której biorą się przykłady z błędem,
  złe odpowiedzi w pytaniu-zawiasie i `bad-*`.
- Klucz do pytania-zawiasu.
- Pytania kontrolne na koniec: uczeń odpowiada z pamięci, bez patrzenia w lekcję.

## 9. Kodek, asystent przy zadaniach

Pod edytorem każdego zadania uczeń może zapytać Kodka, czyli AI, jeśli nauczyciel go włączył
(panel, zakładka Model AI). Wyjątek to „Wytłumacz koledze”, tam rozmawia się z Robciem. Kodek
podpowiada i tłumaczy błędy, ale nie podaje gotowego rozwiązania. Prompt jest wspólny dla
wszystkich kursów (`supabase/functions/assistant/prompt.ts` w kurs-programowania), a lekcja
wpływa na Kodka tylko przez rzeczy wymienione niżej.

Kodek widzi treść zadania, wszystkie `hints:` (i wie, ile z nich uczeń już otworzył), `topics:`
lekcji od pierwszej do tej z zadaniem, notatkę kursu `assistant.md`, kod ucznia i wynik
ostatniego uruchomienia albo sprawdzenia. Przy `kind: local` zamiast kodu widzi tylko to, co
uczeń wpisał w pole „oddaj pracę”. Nie widzi lekcji, notatek nauczyciela, rozwiązań ani testów.

Co z tego wynika przy pisaniu:

- Podpowiedzi są też drabinką dla Kodka. Nie zdradza więcej niż następna podpowiedź, której
  uczeń jeszcze nie otworzył, i może do niej odesłać. Zadanie bez `hints:` daje mu mniej
  oparcia, więc trzy stopnie z działu 6 dotyczą każdego zadania z kodem.
- `topics:` lekcji wyznaczają, czego Kodek może użyć. O rzeczach spoza listy mówi „to będzie
  później na lekcjach”. Brakujący temat uzna za nieznany, a nadmiarowy podsunie za wcześnie.
- Treść zadania ma się obejść bez lekcji. „Zrób jak w przykładzie z baterią” nic Kodkowi nie
  mówi. Nazwij, czego uczeń ma użyć, albo powtórz w jednym zdaniu potrzebny fakt.
- W `kind: choice` wyjaśnienia odpowiedzi muszą być wcięte pod `- [ ]` / `- [x]`. Kodek dostaje
  treść bez znaczników `[x]` i bez wciętych linijek. Wyjaśnienie w zwykłym akapicie pod listą
  zobaczy i może zdradzić dobrą odpowiedź.
- Wiedzę o kursie wpisz do `assistant.md`. Gdy lekcja wprowadza narzędzie z pułapką (klucz,
  instalacja, biblioteka zakazana w zadaniu „od zera”), dopisz tam linijkę. Krótko i bez
  odpowiedzi do zadań. Format jest w JAK-PISAC.
- Gdy lekcja odsyła do Kodka, odmieniaj: Kodek, Kodka, Kodkowi, z Kodkiem, o Kodku. Pisz bez
  form z rodzajem ucznia: „Nie wiesz, od czego zacząć? Zapytaj Kodka pod edytorem.”

## Lista kontrolna przed oddaniem

- [ ] Język: krótkie zdania, „Ty”, codzienne słowa, bez kalk; tekst przeczytany na głos.
- [ ] Otwarcie: powtórka z pamięci tego, co dziś potrzebne, i jedno zdanie celu.
- [ ] Każdy dział: pytanie „jak myślisz…?” przed przykładem (wynik ukryty) i polecenie „zmień”
      z konkretem.
- [ ] Jedno pytanie-zawias z kluczem błędów w notatkach.
- [ ] Przykład z błędem po poprawnym, jeden błąd, realny, najpierw jako zagadka.
- [ ] Zadania od zgadywania wyniku do „dla chętnych”, w tym: typowe błędy, „znajdź błędy”,
      „który sposób?”, powtórka sprzed 2–3 lekcji.
- [ ] „Wytłumacz koledze” (`kind: explain`) z 3–4 pojęciami i kluczem w `.teacher.md`
      (Musi paść, Dobrze, jeśli padnie, Typowe błędne przekonania, O co dopytać).
- [ ] Podpowiedzi w trzech stopniach, bez gotowego kodu.
- [ ] Zadania gotowe pod Kodka: `hints:` przy zadaniach z kodem, pełne `topics:`, treść bez
      odsyłania do lekcji, wcięte wyjaśnienia w `choice`, pułapki kursu w `assistant.md`.
- [ ] Fakty sprawdzalne, przykłady z życia licealisty.
- [ ] Na koniec lekcja, zadania i notatki przez skill `humanizer`.

## Raport z przeglądu

Najpierw 3–5 najważniejszych poprawek (co, gdzie, dlaczego, propozycja), potem tabela
punkt listy kontrolnej → jest / częściowo / brak → gdzie. Bez przepisywania lekcji w raporcie.

Źródło części zasad: Education Agent Skills Library, Gareth Manning, CC BY-SA 4.0
(github.com/garethmanning/claude-education-skills), oraz PRIMM (Raspberry Pi Foundation).
