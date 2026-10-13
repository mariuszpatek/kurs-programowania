"""Unit tests for the browser-side checker.

Run: py -m unittest discover tests
Course content (tasks, tests, solutions) is validated separately by scripts/validate_content.py.
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


if __name__ == "__main__":
    unittest.main()
