"""Validates course content before it is uploaded.

Reads {"tasks": [...], "lessons": [...]} as JSON on stdin (written by sync-content.mjs for Python courses).
- Tasks: the reference solution must pass every test (or, for "predict" tasks, match the real output),
  and every "bad" solution must fail at least one test, so the tests really catch that mistake.
- Lessons: every ```python example must compile (except ```python błąd, a syntax error shown on purpose),
  and every ```python krok example must run in the
  "step by step" view (an error at runtime is fine: lessons show errors on purpose).
- Spoilers (warning only): a lesson example that repeats two lines of a task's reference solution in a row.
Prints a report and exits with 1 when anything is wrong.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "public" / "py"))

import checker  # noqa: E402


def validate(task):
    problems = []
    slug = task["slug"]
    if task["kind"] == "predict":
        if task.get("solution") is None:
            return [f"{slug}: brak pliku z odpowiedzią (.txt)"]
        if not checker.compare_prediction(task["predict_code"], task["solution"])["passed"]:
            problems.append(f"{slug}: odpowiedź w .txt nie zgadza się z prawdziwym wynikiem kodu")
        return problems

    if not task["tests"]:
        return []
    if task.get("solution") is None:
        return [f"{slug}: ma testy, ale brak wzorcowego rozwiązania (.py)"]
    result = checker.check(task["solution"], task["tests"])
    for t in result["tests"]:
        if not t["ok"]:
            problems.append(f"{slug}: wzorcowe rozwiązanie oblewa „{t['name']}”: {t['message']}")
    for bad in task.get("bad", []):
        if checker.check(bad["code"], task["tests"])["passed"]:
            problems.append(f"{slug}: złe rozwiązanie „{bad['name']}” przechodzi wszystkie testy")
    return problems


FENCE = re.compile(r"```(?:python|py)([^\n]*)\n(.*?)```", re.S)


def lesson_examples(lesson):
    """(flags, code) of every Python example in a lesson, e.g. (["krok", "16"], "age = ...")."""
    return [(m.group(1).split(), m.group(2)) for m in FENCE.finditer(lesson["body_md"])]


def validate_lesson(lesson):
    problems = []
    for flags, code in lesson_examples(lesson):
        first = code.strip().splitlines()[0] if code.strip() else ""
        where = f"lekcja {lesson['number']}, przykład „{first}”"
        if "błąd" in flags:
            continue
        try:
            compile(code, "lekcja", "exec")
        except SyntaxError as exc:
            problems.append(f"{where}: błąd składni: {exc.msg} (linijka {exc.lineno})")
            continue
        if flags[:1] == ["krok"]:
            result = checker.trace(code, "\n".join(flags[1:]))
            if result["error"] and result["error"]["type"] == "TooManySteps":
                problems.append(f"{where}: „krok po kroku” ma ponad {checker.MAX_STEPS} kroków")
            elif result["error"] and result["error"]["type"] == "EOFError":
                problems.append(f"{where}: input() nie ma odpowiedzi, dopisz je po słowie krok (```python krok 16)")
    return problems


def _code_lines(code):
    return [line.strip() for line in code.splitlines() if line.strip() and not line.strip().startswith("#")]


def spoilers(tasks, lessons):
    """A lesson example that repeats two consecutive lines of a reference solution gives the answer away."""
    warnings = []
    for task in tasks:
        solution = _code_lines(task.get("solution") or "") if task["kind"] == "code" else []
        pairs = {tuple(solution[i : i + 2]) for i in range(len(solution) - 1)}
        for lesson in lessons:
            for _, code in lesson_examples(lesson):
                lines = _code_lines(code)
                if any(tuple(lines[i : i + 2]) in pairs for i in range(len(lines) - 1)):
                    warnings.append(f"lekcja {lesson['number']} powtarza dwie linijki rozwiązania zadania {task['slug']}")
    return warnings


def main():
    data = json.load(sys.stdin)
    tasks, lessons = (data, []) if isinstance(data, list) else (data["tasks"], data.get("lessons", []))
    problems = [p for task in tasks for p in validate(task)] + [p for lesson in lessons for p in validate_lesson(lesson)]
    checked = sum(1 for t in tasks if t["tests"] or t["kind"] == "predict")
    bad = sum(len(t.get("bad", [])) for t in tasks)
    examples = sum(len(lesson_examples(lesson)) for lesson in lessons)
    for warning in spoilers(tasks, lessons):
        print(f"! uwaga, możliwy spoiler: {warning}")
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"OK: {checked} zadań sprawdzonych, {bad} złych rozwiązań wyłapanych, {examples} przykładów z lekcji działa")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
