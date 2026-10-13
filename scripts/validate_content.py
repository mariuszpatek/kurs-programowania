"""Validates task tests against reference solutions before content is uploaded.

Reads a JSON list of tasks on stdin (written by sync-content.mjs). For each task:
- the reference solution must pass every test (or, for "predict" tasks, match the real output),
- every "bad" solution must fail at least one test, so the tests really catch that mistake.
Prints a report and exits with 1 when anything is wrong.
"""

import json
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


def main():
    tasks = json.load(sys.stdin)
    problems = [p for task in tasks for p in validate(task)]
    checked = sum(1 for t in tasks if t["tests"] or t["kind"] == "predict")
    bad = sum(len(t.get("bad", [])) for t in tasks)
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"OK: {checked} zadań sprawdzonych, {bad} złych rozwiązań wyłapanych")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
