"""Unit tests for the browser-side checker.

Run: py -m unittest discover tests
Course content (tasks, tests, solutions) is validated separately by scripts/validate_python.py.
"""

import json
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


FUNCTION_TESTS = '''
def test_double(ctx):
    """double() podwaja liczbę"""
    assert ctx.call("double", 4) == 8

def test_missing(ctx):
    ctx.function("triple")
'''


class Functions(unittest.TestCase):
    def test_call_and_missing_function(self):
        r = checker.check("def double(x):\n    print('liczę')\n    return x * 2\n", FUNCTION_TESTS)
        self.assertEqual([t["ok"] for t in r["tests"]], [True, False])
        self.assertIn("Nie ma funkcji triple()", r["tests"][1]["message"])
        self.assertEqual(r["run"]["output"], "")

    def test_exception_names_the_call(self):
        r = checker.check("def double(x):\n    return x + y\n", FUNCTION_TESTS)
        self.assertIn("double(4) zakończyła się błędem: NameError", r["tests"][0]["message"])

    def test_classes_are_reachable(self):
        tests = 'def test_counter(ctx):\n    c = ctx.call("Counter", 2)\n    c.add()\n    assert c.value == 3\n'
        r = checker.check("class Counter:\n    def __init__(self, start):\n        self.value = start\n    def add(self):\n        self.value += 1\n", tests)
        self.assertTrue(r["passed"], r["tests"])
        self.assertNotIn("ValueError", checker.run("from math import sqrt\nclass A:\n    pass\n").functions)

    def test_imported_functions_are_not_the_students(self):
        r = checker.run("from math import sqrt\ndef f():\n    return 1\n")
        self.assertEqual(list(r.functions), ["f"])
        self.assertNotIn("f", r.variables)


MODEL_TESTS = '''
def test_asks_twice(ctx):
    """Pyta model drugi raz po złej odpowiedzi"""
    model = ctx.fake_model(["nie wiem", "5"])
    assert ctx.call("rate", "Świetny film") == 5
    assert len(model.calls) == 2
    assert "Świetny film" in model.prompts[0]
    assert model.calls[0]["system"] == "Odpowiadaj liczbą"
'''

RATE = """
def rate(review):
    for attempt in range(2):
        answer = ask(f"Oceń od 1 do 5: {review}", system="Odpowiadaj liczbą")
        if answer.isdigit():
            return int(answer)
    return None
"""


class Model(unittest.TestCase):
    def tearDown(self):
        checker.LLM_BACKEND = None

    def test_fake_model_in_tests(self):
        r = checker.check(RATE, MODEL_TESTS)
        self.assertTrue(r["passed"], r["tests"])

    def test_fake_model_runs_out_of_answers(self):
        r = checker.check(RATE.replace("range(2)", "range(3)"), MODEL_TESTS.replace('["nie wiem", "5"]', '["nie wiem"]'))
        self.assertIn("Udawany model nie ma już odpowiedzi", r["tests"][0]["message"])

    def test_without_backend_the_real_model_is_unavailable(self):
        r = checker.run('print(ask("Cześć"))')
        self.assertEqual(r.error["type"], "ModelError")

    def test_backend_gets_json_and_usage_is_reported(self):
        seen = []

        def backend(request):
            seen.append(json.loads(request))
            return json.dumps({"text": "Ahoj", "provider": "anthropic", "model": "m", "input_tokens": 3, "output_tokens": 1, "cost_usd": 0.0001})

        checker.LLM_BACKEND = backend
        r = checker.run('print(chat([{"role": "user", "content": "Hej"}], temperature=0))')
        self.assertEqual(r.output, "Ahoj\n")
        self.assertEqual(seen[0]["messages"], [{"role": "user", "content": "Hej"}])
        self.assertEqual(seen[0]["temperature"], 0)
        self.assertEqual(r.to_dict()["llm"][0]["cost_usd"], 0.0001)

    def test_backend_error_becomes_model_error(self):
        checker.LLM_BACKEND = lambda request: json.dumps({"error": "Wykorzystano miesięczny limit"})
        r = checker.run('ask("Hej")')
        self.assertEqual(r.error["type"], "ModelError")
        self.assertIn("limit", r.error["message"])

    def test_main_block_runs_only_outside_tests(self):
        code = RATE + '\nif __name__ == "__main__":\n    print(rate("demo"))\n'
        self.assertEqual(checker.run(code).error["type"], "ModelError")
        self.assertTrue(checker.check(code, MODEL_TESTS)["passed"])

    def test_bad_messages(self):
        r = checker.run('chat([{"role": "system", "content": "x"}])')
        self.assertEqual(r.error["type"], "TypeError")


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


class Flowchart(unittest.TestCase):
    def test_sequence_and_io(self):
        flow = checker.flowchart('a = input("? ")\nprint(a)\n')
        self.assertEqual(flow["main"], [
            {"kind": "stmt", "line": 1, "text": 'a = input("? ")', "io": "in", "calls": []},
            {"kind": "stmt", "line": 2, "text": "print(a)", "io": "out", "calls": []},
        ])
        self.assertEqual(flow["functions"], {})

    def test_if_elif_else(self):
        code = 'x = 5\nif x > 3:\n    print("a")\nelif x > 1:\n    print("b")\nelse:\n    print("c")\n'
        branches = checker.flowchart(code)["main"][1]["branches"]
        self.assertEqual([b["test"] for b in branches], ["x > 3", "x > 1", None])
        self.assertEqual([b["line"] for b in branches], [2, 4, 6])
        self.assertEqual(branches[2]["body"][0]["line"], 7)

    def test_else_with_if_inside_is_not_elif(self):
        code = "x = 1\nif x:\n    pass\nelse:\n    if x:\n        pass\n"
        branches = checker.flowchart(code)["main"][1]["branches"]
        self.assertEqual([b["test"] for b in branches], ["x", None])
        self.assertEqual(branches[1]["body"][0]["kind"], "if")

    def test_loops_and_jumps(self):
        code = "n = 0\nwhile n < 5:\n    n += 1\n    if n == 2:\n        continue\n    if n == 4:\n        break\nfor w in ['a', 'b']:\n    print(w)\n"
        main = checker.flowchart(code)["main"]
        self.assertEqual(main[1]["kind"], "while")
        self.assertEqual(main[1]["test"], "n < 5")
        self.assertEqual(main[1]["body"][1]["branches"][0]["body"], [{"kind": "continue", "line": 5}])
        self.assertEqual(main[1]["body"][2]["branches"][0]["body"], [{"kind": "break", "line": 7}])
        self.assertEqual((main[2]["kind"], main[2]["target"], main[2]["iter"]), ("for", "w", "['a', 'b']"))

    def test_functions(self):
        code = "def double(n):\n    return n * 2\ny = double(3)\n"
        flow = checker.flowchart(code)
        self.assertEqual(flow["functions"], {"double": {"line": 1, "params": "n", "body": [
            {"kind": "return", "line": 2, "text": "n * 2", "calls": []}]}})
        self.assertEqual(flow["main"], [{"kind": "stmt", "line": 3, "text": "y = double(3)", "io": None, "calls": ["double"]}])

    def test_two_statements_on_one_line_are_one_block(self):
        self.assertEqual(len(checker.flowchart("a = 1; b = 2\n")["main"]), 1)

    def test_what_cannot_be_drawn(self):
        for code in ("try:\n    x = 1\nexcept Exception:\n    pass\n",
                     "while False:\n    pass\nelse:\n    pass\n",
                     "def f():\n    def g():\n        pass\n",
                     "class A:\n    pass\n",
                     "\n".join(f"a{i} = {i}" for i in range(41)) + "\n",
                     'print("a)\n'):
            self.assertIsNone(checker.flowchart(code), code)

    def test_trace_has_flow(self):
        self.assertEqual(checker.trace("a = 1\n")["flow"]["main"][0]["text"], "a = 1")

    def test_steps_know_the_function(self):
        code = "def double(n):\n    r = n * 2\n    return r\ny = double(3)\nprint(y)\n"
        steps = checker.trace(code)["steps"]
        inside = [s for s in steps if s["frame"] == "double"]
        self.assertEqual([s["line"] for s in inside], [2, 3])
        self.assertEqual(inside[0]["locals"], [{"name": "n", "type": "int", "value": "3"}, {"name": "r", "type": "int", "value": "6"}])
        self.assertEqual(inside[0]["depth"], 1)
        outside = [s for s in steps if s["frame"] is None]
        self.assertTrue(all(s["locals"] == [] and s["depth"] == 0 for s in outside))
        self.assertEqual(steps[-1]["line"], 5)


if __name__ == "__main__":
    unittest.main()
