# Zadanie „Wytłumacz koledze” (beta)

Zatwierdzone w rozmowie 2026-11-09.

## Cel

Sprawdzenie, czy uczeń rozumie pojęcia z lekcji, przez tłumaczenie ich komuś, kto ich nie zna.
Na razie tylko dla nauczyciela (szkice), oznaczone jako beta.

## Rodzaj zadania `kind: explain`

- `tasks/NN/NN-wytlumacz.md`: wstęp dla ucznia i lista 3–4 pojęć. Frontmatter `draft: true`
  sprawia, że nowe zadanie wchodzi jako szkic także w opublikowanej lekcji.
- `tasks/NN/NN-wytlumacz.teacher.md`: klucz (co musi paść przy każdym pojęciu, typowe błędne
  przekonania). Obowiązkowy dla `explain`. Trafia do `lms_task_notes` (RLS: tylko nauczyciel);
  funkcja na serwerze czyta go kluczem service role, do przeglądarki ucznia nie trafia.

## Rozmowa

- Na stronie zadania czat zamiast edytora. AI gra młodszego kolegę („Kuba”), który nie zna Pythona:
  pyta o pojęcia po kolei, dopytuje naiwnie, celuje w braki z klucza, nie podpowiada.
- „Zakończ i podsumuj” (albo limit wiadomości w rozmowie) → podsumowanie w JSON
  (structured output): każde pojęcie `umie` / `czesciowo` / `nie` + komentarz.
- Zaliczone, gdy wszystkie pojęcia `umie`. Funkcja zapisuje próbę sama (service role):
  `code` = rozmowa, `results` = podsumowanie. Uczeń nie może sfałszować zaliczenia.

## Serwer: edge function `explain`

- Logowanie, `lms_has_access`, zadanie czytane kluczem ucznia (RLS pilnuje szkiców i odblokowania).
- Limity (funkcja `lms_use_explain`, tylko service role):
  dzienny na ucznia, wspólny dla wszystkich zadań explain (`EXPLAIN_DAILY_LIMIT`, domyślnie 60),
  łączny na ucznia w jednym zadaniu (`EXPLAIN_TASK_LIMIT`, domyślnie 80).
  W jednej rozmowie najwyżej 14 wiadomości ucznia, potem tylko podsumowanie.
- Claude Haiku 5.5 (`claude-haiku-5-5`) przez `@anthropic-ai/sdk`, `effort: low`,
  klucz `ANTHROPIC_API_KEY` w sekretach Supabase. Bez `temperature` (400 na tym modelu).
- Treść rozmowy i zadania to dane, nie polecenia (ochrona przed „podaj odpowiedź”).

## Baza (migracja ręcznie w SQL Editor)

- `lms_tasks_kind_check` + `explain`; na `feat/kursy-ai` połączona migracja rodzajów.
- `lms_explain_usage (user_id, task_id, created_at)`, RLS bez polityk.

## Testy

- `tests/explain.test.ts`: prompt (klucz w systemie, rozmowa jako dane), zaliczenie z podsumowania,
  limit wiadomości.
- Walidacja treści: `explain` bez `.teacher.md` to błąd.
- Ręcznie: rozmowa na stronie jako nauczyciel.

## Kolejność

Platforma + lekcja 5 na próbę; lekcje 1–4 po akceptacji rozmowy przez nauczyciela.
