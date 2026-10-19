"""Unit tests for the browser-side checker.

Run: py -m unittest discover tests
Course content (tasks, tests, solutions) is validated separately by scripts/validate_python.py.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "public" / "py"))

import checker  # noqa: E402

SAMPLE_TESTS = '''
def test_greets(ctx):
    """Wita użytkownika"""
    expect_line(ctx, 2, "Cześć Ola", stdin="Ola\\n")

def test_has_name_variable(ctx):
    assert "name" in ctx.run("Ola\\n").variables, "Brakuje zmiennej name."
'''


class Run(unittest.TestCase):
    def test_output_and_variables(self):
        r = checker.run('x = 2\nprint("x =", x)')
        self.assertEqual(r.output, "x = 2\n")
        self.assertEqual(r.variables, {"x": 2})
        self.assertIsNone(r.error)

    def test_input_reads_stdin(self):
        r = checker.run('a = input("Imię: ")\nprint("Cześć", a)', "Ola\n")
        self.assertEqual(r.lines, ["Imię: Ola", "Cześć Ola"])

    def test_missing_input(self):
        self.assertEqual(checker.run("input()").error["type"], "EOFError")

    def test_syntax_error_has_line_and_hint(self):
        r = checker.run('print("ok")\nprint("Cześć!)')
        self.assertEqual(r.error["type"], "SyntaxError")
        self.assertEqual(r.error["line"], 2)
        self.assertIn("cudzysłowu", r.error["hint"])
        self.assertEqual(r.output, "")

    def test_runtime_error_keeps_earlier_output(self):
        r = checker.run('print("a")\nPrint("b")')
        self.assertEqual(r.output, "a\n")
        self.assertEqual(r.error["type"], "NameError")
        self.assertEqual(r.error["line"], 2)

    def test_too_much_output(self):
        self.assertEqual(checker.run("while True:\n    print('x')").error["type"], "TooMuchOutput")

    def test_exit_is_not_an_error(self):
        r = checker.run("print(1)\nexit()\nprint(2)")
        self.assertIsNone(r.error)
        self.assertEqual(r.lines, ["1"])


class Check(unittest.TestCase):
    def test_passing(self):
        r = checker.check('name = input()\nprint("Cześć", name)', SAMPLE_TESTS)
        self.assertTrue(r["passed"])
        self.assertEqual([t["name"] for t in r["tests"]], ["Wita użytkownika", "has name variable"])

    def test_failing_line_message(self):
        r = checker.check('name = input()\nprint("Hej", name)', SAMPLE_TESTS)
        self.assertFalse(r["passed"])
        self.assertIn("oczekiwano „Cześć Ola”", r["tests"][0]["message"])

    def test_crash_is_reported_in_every_test(self):
        r = checker.check("print(", SAMPLE_TESTS)
        self.assertTrue(all("SyntaxError" in t["message"] for t in r["tests"]))


class Predict(unittest.TestCase):
    CODE = 'a = "5"\nprint(a + a)\nprint(5 + 5)\n'

    def test_right(self):
        self.assertTrue(checker.compare_prediction(self.CODE, "55\n10\n")["passed"])

    def test_wrong_line_is_marked(self):
        r = checker.compare_prediction(self.CODE, "10\n10")
        self.assertEqual([l["ok"] for l in r["lines"]], [False, True])

    def test_empty(self):
        self.assertFalse(checker.compare_prediction(self.CODE, "")["passed"])


class Trace(unittest.TestCase):
    def test_state_after_each_line(self):
        steps = checker.trace('a = 5\na = a + 1\nprint(a)\n')["steps"]
        self.assertEqual([s["line"] for s in steps], [None, 1, 2, 3])
        self.assertEqual(steps[0]["variables"], [])
        self.assertEqual(steps[2]["variables"], [{"name": "a", "type": "int", "value": "6"}])
        self.assertEqual(steps[3]["output"], "6\n")

    def test_input_and_error(self):
        result = checker.trace('w = input("? ")\nprint(w + 1)\n', "16\n")
        self.assertEqual(result["steps"][1]["variables"], [{"name": "w", "type": "str", "value": "'16'"}])
        self.assertEqual(result["steps"][-1]["line"], 2)
        self.assertEqual(result["error"]["type"], "TypeError")

    def test_syntax_error_has_no_steps(self):
        result = checker.trace('print("a)')
        self.assertEqual(result["steps"], [])
        self.assertEqual(result["error"]["type"], "SyntaxError")

    def test_parts_show_how_a_line_is_computed(self):
        parts = checker.trace("print(2 + 3 * 4)\n")["steps"][1]["parts"]
        self.assertEqual([p["text"] for p in parts], ["print(2 + 12)", "print(14)"])
        self.assertEqual((parts[0]["before"], parts[0]["value"]), ("3 * 4", "12"))
        self.assertEqual(parts[0]["text"][parts[0]["from"] : parts[0]["to"]], "12")

    def test_parts_with_polish_letters_and_input(self):
        code = 'age = int(input("Ile masz lat? "))\nprint("Będziesz mieć", age + 1)\n'
        steps = checker.trace(code, "16\n")["steps"]
        self.assertEqual([p["text"] for p in steps[1]["parts"]], ["age = int('16')", "age = 16"])
        self.assertEqual([p["text"] for p in steps[2]["parts"]], ['print("Będziesz mieć", 16 + 1)', 'print("Będziesz mieć", 17)'])

    def test_instrumented_program_behaves_the_same(self):
        code = 'name = "ola".upper()\nok = 5 > 3 and name == "OLA"\nprint(f"{10 / 3:.2f}", ok)\n'
        self.assertEqual(checker.trace(code)["steps"][-1]["output"], checker.run(code).output)

    def test_endless_loop_is_cut(self):
        result = checker.trace("while True:\n    x = 1\n")
        self.assertEqual(len(result["steps"]), checker.MAX_STEPS + 1)
        self.assertEqual(result["error"]["type"], "TooManySteps")


if __name__ == "__main__":
    unittest.main()
