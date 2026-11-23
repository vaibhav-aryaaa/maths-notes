import pytest
from evals.normalize import compare_answers, clean_latex, parse_normalized

def test_clean_latex():
    assert clean_latex("$x = -3$") == "x = -3"
    assert clean_latex(r"\( x = \frac{1}{2} \)") == "x = (1)/(2)"
    assert clean_latex("x \u2212 3 = 0") == "x - 3 = 0"
    assert clean_latex(r"\textbf{x \ge 5}") == "x >= 5"


def test_scalar_equivalence():
    # Prompt requirement: (x = -3, -3, -3.0, −3 are equal)
    assert compare_answers("x = -3", "-3")
    assert compare_answers("-3", "-3.0")
    assert compare_answers("-3.0", "\u22123")
    assert compare_answers("x = \u22123", "-3.0")
    assert compare_answers("x = -3", -3)
    assert compare_answers("x = 5", "5")
    assert not compare_answers("x = -3", "3")


def test_fractions_and_decimals():
    assert compare_answers("1/2", "0.5")
    assert compare_answers(r"\frac{1}{2}", "0.5")
    assert compare_answers("x = 3/4", "0.75")
    assert compare_answers("-1/4", "-0.25")


def test_multi_roots_sets():
    # Multiple roots compare as sets: {-2, 2} == {2, -2}
    assert compare_answers("2, -2", "-2, 2")
    assert compare_answers("x = 2, x = -2", "{-2, 2}")
    assert compare_answers(r"x = \pm 2", "2, -2")
    assert compare_answers("{-3, 3}", "{3, -3}")
    assert compare_answers("x = -1, 5", "5, -1")
    assert not compare_answers("2, -2", "2, 3")
    assert not compare_answers("2, -2", "2")


def test_systems_of_equations():
    assert compare_answers("x = 6, y = 4", "y = 4, x = 6")
    assert compare_answers("x = 2, y = -1", "y = -1, x = 2")
    assert compare_answers("x = 6 and y = 4", "x = 6, y = 4")
    assert not compare_answers("x = 6, y = 4", "x = 4, y = 6")


def test_no_solution():
    assert compare_answers("no solution", "no real solution")
    assert compare_answers("no real roots", "No Solution")
    assert compare_answers("undefined", "no solution")
    assert compare_answers(r"\emptyset", "no solution")
    assert compare_answers("Does not exist", "no solution")
    assert not compare_answers("x = 0", "no solution")


def test_inequalities():
    assert compare_answers("x > 3", "x > 3")
    assert compare_answers(r"x \ge 5", "x >= 5")
    assert compare_answers(r"x \le -2", "x <= -2")
    assert compare_answers("x <= -2", "x <= -2")
    assert not compare_answers("x > 3", "x < 3")


def test_expressions():
    assert compare_answers("2x", "2x")
    assert compare_answers(r"\cos(x)", "cos(x)")
    assert compare_answers("x^2 + 2x", "x^2 + 2x")
