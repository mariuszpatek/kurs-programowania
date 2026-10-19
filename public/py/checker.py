"""Runs student code and checks it against a task's tests.

The same file runs in the browser (Pyodide) and locally (CPython), so task tests
can be validated against reference solutions before they are published.
Student-facing messages are in Polish.
"""

import builtins
import io
import re
import sys
import traceback
import types

STUDENT_FILE = "twoj_kod.py"
MAX_OUTPUT = 20_000

SYNTAX_HINTS = [
    ("unterminated string literal", "Brakuje zamykającego cudzysłowu w tekście."),
    ("unterminated triple-quoted string", "Brakuje zamykających potrójnych cudzysłowów."),
    ("invalid decimal literal", "Nazwa nie może zaczynać się od cyfry. Możliwe też, że brakuje spacji albo operatora między liczbą a nazwą."),
    ("was never closed", "Brakuje nawiasu zamykającego."),
    ("unmatched", "Jest nawias zamykający bez pasującego otwierającego."),
    ("expected ':'", "Brakuje dwukropka na końcu linijki (np. po if, else, for, while)."),
    ("intended to be part of the string", "W tekście jest cudzysłów, który kończy tekst za wcześnie. Użyj na zewnątrz apostrofów: 'tekst z \"cudzysłowem\"'."),
    ("Perhaps you forgot a comma", "Między elementami brakuje przecinka albo jest tekst bez cudzysłowu."),
    ("cannot assign to", "Po lewej stronie = musi być nazwa zmiennej."),
    ("invalid character", "W kodzie jest znak, którego Python nie rozumie (np. polski cudzysłów „ ” zamiast \")."),
    ("Maybe you meant '==' or ':=' instead of '='", "Do porównania używa się ==, a pojedynczy = to przypisanie."),
]

ERROR_HINTS = {
    "IndentationError": "Problem z wcięciem. Sprawdź, czy linijki w jednym bloku mają tyle samo spacji na początku.",
    "TabError": "W wcięciach są pomieszane tabulatory i spacje.",
    "NameError": "Python nie zna tej nazwy. Sprawdź literówki i wielkość liter. Jeśli to miał być tekst, musi być w cudzysłowie.",
    "TypeError": "Działanie na wartościach niepasujących typów, np. dodawanie tekstu do liczby.",
    "ValueError": "Wartość ma dobry typ, ale złą treść, np. int(\"abc\").",
    "ZeroDivisionError": "Dzielenie przez zero.",
    "EOFError": "Program prosi o dane (input), ale w polu „Dane dla input()” nie ma już kolejnych linijek.",
    "IndexError": "Odwołanie do elementu spoza zakresu (za duży indeks).",
    "KeyError": "W słowniku nie ma takiego klucza.",
    "AttributeError": "Ta wartość nie ma takiej metody ani atrybutu. Sprawdź nazwę i typ zmiennej.",
    "RecursionError": "Funkcja wywołuje samą siebie bez końca.",
}


class TooMuchOutput(Exception):
    pass


class _Output(io.StringIO):
    def write(self, s):
        if self.tell() + len(s) > MAX_OUTPUT:
            super().write(s[: max(0, MAX_OUTPUT - self.tell())])
            raise TooMuchOutput()
        return super().write(s)


def _describe_error(exc, code):
    kind = type(exc).__name__
    line = None
    if isinstance(exc, SyntaxError) and exc.filename == STUDENT_FILE:
        line = exc.lineno
    else:
        for frame in traceback.extract_tb(exc.__traceback__):
            if frame.filename == STUDENT_FILE:
                line = frame.lineno
    message = f"{kind}: {exc.msg}" if isinstance(exc, SyntaxError) else f"{kind}: {exc}"

    hint = ERROR_HINTS.get(kind)
    if kind == "SyntaxError":
        hint = "Python nie rozumie zapisu tej linijki. Sprawdź cudzysłowy, nawiasy i przecinki."
        for fragment, text in SYNTAX_HINTS:
            if fragment in str(exc.msg):
                hint = text
                break
    if isinstance(exc, TooMuchOutput):
        message = "Program wypisał za dużo tekstu."
        hint = "Możliwe, że pętla nigdy się nie kończy."

    line_text = None
    if line is not None:
        lines = code.splitlines()
        if 1 <= line <= len(lines):
            line_text = lines[line - 1]
    return {"type": kind, "message": message, "line": line, "line_text": line_text, "hint": hint}


def _user_variables(namespace):
    return {
        name: value
        for name, value in namespace.items()
        if not name.startswith("__") and not isinstance(value, (types.ModuleType, types.FunctionType, type))
    }


class RunResult:
    def __init__(self, output, error, variables):
        self.output = output
        self.error = error
        self.variables = variables

    @property
    def lines(self):
        return [l.rstrip() for l in self.output.rstrip("\n").split("\n")] if self.output.strip() else []

    def to_dict(self):
        return {"output": self.output, "error": self.error}


def _student_namespace(stdin, out):
    """Globals for student code: input() reads consecutive lines from `stdin` and echoes them like a terminal."""
    pending = stdin.split("\n") if stdin else []
    if pending and pending[-1] == "":
        pending.pop()

    def fake_input(prompt=""):
        out.write(str(prompt))
        if not pending:
            raise EOFError("brak danych w polu „Dane dla input()”")
        value = pending.pop(0)
        out.write(value + "\n")
        return value

    return {"__name__": "__main__", "__builtins__": dict(vars(builtins), input=fake_input)}


def run(code, stdin=""):
    """Executes student code. input() reads consecutive lines from `stdin`."""
    out = _Output()
    namespace = _student_namespace(stdin, out)
    real_stdout = sys.stdout
    error = None
    try:
        compiled = compile(code, STUDENT_FILE, "exec")
        sys.stdout = out
        exec(compiled, namespace)
    except BaseException as exc:  # noqa: BLE001 - student code may raise anything
        if isinstance(exc, KeyboardInterrupt):
            raise
        if not isinstance(exc, SystemExit):
            error = _describe_error(exc, code)
    finally:
        sys.stdout = real_stdout
    return RunResult(out.getvalue(), error, _user_variables(namespace))


class Context:
    """What test_* functions in a task's test file receive."""

    def __init__(self, code):
        self.code = code
        self._runs = {}

    def run(self, stdin=""):
        if stdin not in self._runs:
            self._runs[stdin] = run(self.code, stdin)
        result = self._runs[stdin]
        if result.error:
            e = result.error
            where = f" (linijka {e['line']})" if e["line"] else ""
            raise AssertionError(f"Program zakończył się błędem{where}: {e['message']}")
        return result

    @property
    def result(self):
        return self.run()

    @property
    def lines(self):
        return self.result.lines

    @property
    def variables(self):
        return self.result.variables

    @property
    def code_lines(self):
        """Non-empty, non-comment lines of the student's code."""
        return [l for l in self.code.splitlines() if l.strip() and not l.strip().startswith("#")]


def _same_line(expected, actual):
    return re.sub(r"\s+", " ", expected.strip()) == re.sub(r"\s+", " ", actual.strip())


def expect_line(ctx, number, expected, stdin=""):
    """Test helper: checks output line `number` (1-based)."""
    lines = ctx.run(stdin).lines
    if number > len(lines):
        raise AssertionError(f"Program wypisał {len(lines)} linijek, a linijka {number} miała brzmieć: {expected}")
    if not _same_line(expected, lines[number - 1]):
        raise AssertionError(f"Linijka {number}: oczekiwano „{expected}”, a program wypisał „{lines[number - 1]}”")


def _test_name(fn):
    if fn.__doc__:
        return fn.__doc__.strip().splitlines()[0]
    return fn.__name__.removeprefix("test_").replace("_", " ")


def check(code, tests):
    """Runs every test_* function from the `tests` source against the student's code."""
    namespace = {"__name__": "task_tests", "expect_line": expect_line}
    exec(compile(tests, "task_tests.py", "exec"), namespace)
    test_functions = [f for name, f in namespace.items() if name.startswith("test_") and callable(f)]

    ctx = Context(code)
    results = []
    for fn in test_functions:
        try:
            fn(ctx)
            results.append({"name": _test_name(fn), "ok": True, "message": None})
        except AssertionError as exc:
            results.append({"name": _test_name(fn), "ok": False, "message": str(exc) or "Wynik się nie zgadza."})
        except Exception as exc:  # noqa: BLE001 - a broken test should be reported, not crash the page
            results.append({"name": _test_name(fn), "ok": False, "message": f"Nie udało się sprawdzić: {type(exc).__name__}: {exc}"})

    first_run = ctx._runs.get("")
    return {
        "passed": all(r["ok"] for r in results),
        "tests": results,
        "run": first_run.to_dict() if first_run else None,
    }


def _normalize(text):
    lines = [l.rstrip() for l in text.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    while lines and not lines[0]:
        lines.pop(0)
    return lines


def compare_prediction(code, prediction):
    """"What will be printed?" tasks: compares the student's guess with the real output line by line."""
    result = run(code)
    actual = _normalize(result.output)
    guessed = _normalize(prediction)
    lines = []
    for i in range(max(len(actual), len(guessed))):
        a = actual[i] if i < len(actual) else None
        g = guessed[i] if i < len(guessed) else None
        lines.append({"student": g, "actual": a, "ok": a is not None and g is not None and a.strip() == g.strip()})
    return {"passed": bool(lines) and all(l["ok"] for l in lines), "lines": lines, "error": result.error}


MAX_STEPS = 500


class TooManySteps(Exception):
    pass


def _describe_variables(namespace):
    variables = []
    for name, value in _user_variables(namespace).items():
        text = repr(value)
        if len(text) > 80:
            text = text[:77] + "..."
        variables.append({"name": name, "type": type(value).__name__, "value": text})
    return variables


def trace(code, stdin=""):
    """"Step by step" view of a lesson example: the state after every executed line.

    Each step: the line just executed (None before the start), variables, output so far,
    and an error if the program stopped on that line.
    """
    out = _Output()
    namespace = _student_namespace(stdin, out)
    steps = []
    previous = [None]

    def snapshot(error=None):
        steps.append({"line": previous[0], "variables": _describe_variables(namespace), "output": out.getvalue(), "error": error})
        if len(steps) > MAX_STEPS:
            raise TooManySteps()

    def on_line(frame, event, arg):
        if event == "line":
            snapshot()
            previous[0] = frame.f_lineno
        return on_line

    def on_call(frame, event, arg):
        return on_line if frame.f_code.co_filename == STUDENT_FILE else None

    real_stdout = sys.stdout
    try:
        compiled = compile(code, STUDENT_FILE, "exec")
    except SyntaxError as exc:
        return {"steps": [], "error": _describe_error(exc, code)}
    try:
        sys.stdout = out
        sys.settrace(on_call)
        exec(compiled, namespace)
        sys.settrace(None)
        snapshot()
    except TooManySteps:
        steps[-1]["error"] = {
            "type": "TooManySteps",
            "message": f"Program ma więcej niż {MAX_STEPS} kroków, pokazuję pierwsze.",
            "line": None,
            "line_text": None,
            "hint": None,
        }
    except BaseException as exc:  # noqa: BLE001 - student code may raise anything
        sys.settrace(None)
        if isinstance(exc, KeyboardInterrupt):
            raise
        snapshot(None if isinstance(exc, SystemExit) else _describe_error(exc, code))
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout
    return {"steps": steps, "error": steps[-1]["error"] if steps else None}
