import math
import re
from typing import Any


def clean_latex(s: str) -> str:
    """Clean LaTeX and formatting artifacts from a math string."""
    if not isinstance(s, str):
        s = str(s)

    # Strip markdown / latex delimiters
    s = s.strip()
    s = re.sub(r"^\$+|(?<=[^\\])\$+$", "", s)
    s = re.sub(r"\\\(|\\\)|\\\[|\\\]", "", s)
    s = re.sub(r"\*\*(.*?)\*\*", r"\1", s)  # bold

    # Replace unicode minus and math symbols
    s = s.replace("\u2212", "-")
    s = s.replace("\u2013", "-")
    s = s.replace("\u2014", "-")
    s = s.replace("–", "-")
    s = s.replace("—", "-")
    s = s.replace("\\times", "*")
    s = s.replace("\\cdot", "*")
    s = s.replace("×", "*")
    s = s.replace("·", "*")

    # Fractions: \frac{a}{b} -> (a)/(b)
    s = re.sub(r"\\frac\{([^{}]+)\}\{([^{}]+)\}", r"(\1)/(\2)", s)
    s = re.sub(r"\\dfrac\{([^{}]+)\}\{([^{}]+)\}", r"(\1)/(\2)", s)

    # Inequalities
    s = re.sub(r"\\le(q)?", "<=", s)
    s = re.sub(r"\\ge(q)?", ">=", s)
    s = re.sub(r"\\neq", "!=", s)
    s = s.replace("≤", "<=").replace("≥", ">=")

    # Remove text wrappers \text{...}, \mathrm{...}, \mathbf{...}, \textbf{...}
    s = re.sub(r"\\(text|mathrm|mathbf|mathit|textbf|textit)\{([^{}]+)\}", r"\2", s)

    # Remove remaining backslashes before common functions
    s = re.sub(r"\\(sin|cos|tan|cot|sec|csc|log|ln|exp|sqrt)", r"\1", s)

    # Collapse multiple whitespaces
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _try_parse_number(token: str) -> float | None:
    token = token.strip()
    # Remove outer parentheses if present e.g. (1)/(2) or (-3)
    frac_match = re.match(r"^\(?([+-]?\d+(?:\.\d+)?)\)?\s*/\s*\(?([+-]?\d+(?:\.\d+)?)\)?$", token)
    if frac_match:
        try:
            num = float(frac_match.group(1))
            den = float(frac_match.group(2))
            if den != 0:
                return num / den
        except ValueError:
            pass
    try:
        clean_token = token.strip("()")
        return float(clean_token)
    except ValueError:
        return None


def parse_normalized(val: Any) -> Any:
    """
    Parse a math answer into a canonical representation:
    - No solution: ("NO_SOLUTION",)
    - Single float: float (within tolerance)
    - Set of floats or values: frozenset({...})
    - Variable system: Tuple of (var, float) sorted by var
    - Inequality: ("INEQ", var, op, float)
    - Normalized string expression (fallback)
    """
    if val is None:
        return ("NO_SOLUTION",)

    if isinstance(val, (int, float)):
        return float(val)

    # Handle dictionary e.g. {"x": 6, "y": 4}
    if isinstance(val, dict):
        pairs = {}
        for k, v in val.items():
            num = _try_parse_number(str(v))
            if num is not None:
                pairs[str(k).lower()] = round(num, 5)
            else:
                pairs[str(k).lower()] = str(v).strip().lower()
        return tuple(sorted(pairs.items()))

    # Handle list or tuple
    if isinstance(val, (list, tuple, set)):
        # Check if list of dicts with 'expr' and 'result' (e.g. multi-solution from solver)
        if all(isinstance(x, dict) and ("expr" in x or "result" in x) for x in val if x is not None):
            dict_rep = {}
            for item in val:
                if not item:
                    continue
                var = item.get("expr") or "ans"
                res = item.get("result")
                # Strip 'x = ' if expr was an equation
                var_match = re.search(r"([a-zA-Z])", str(var))
                var_name = var_match.group(1).lower() if var_match else str(var).lower()
                num = _try_parse_number(str(res))
                if num is not None:
                    dict_rep[var_name] = round(num, 5)
                else:
                    dict_rep[var_name] = str(res).strip().lower()
            if dict_rep:
                return tuple(sorted(dict_rep.items()))

        items = []
        for x in val:
            p = parse_normalized(x)
            if isinstance(p, float):
                items.append(round(p, 5))
            else:
                items.append(p)
        return frozenset(items)

    s = clean_latex(str(val)).strip()
    s_lower = s.lower()

    # 1. No solution / undefined / empty set
    no_solution_patterns = [
        "no solution",
        "no real solution",
        "no real solutions",
        "no real roots",
        "undefined",
        "none",
        "empty set",
        "null set",
        "ø",
        "∅",
        "\\emptyset",
        "does not exist",
        "dne",
        "impossible",
    ]
    for pat in no_solution_patterns:
        if pat in s_lower:
            return ("NO_SOLUTION",)

    # 2. Plus-minus pattern e.g. x = \pm 3 or +-3
    pm_match = re.match(r"^(?:[a-zA-Z]\s*=\s*)?(?:\\pm|\+-|±)\s*(\d+(?:\.\d+)?|\([^{}]+\)/[^{}]+|[a-zA-Z0-9]+)$", s)
    if pm_match:
        token = pm_match.group(1).strip("()")
        base_num = _try_parse_number(token)
        if base_num is not None:
            return frozenset({round(base_num, 5), round(-base_num, 5)})
        # Or symbol e.g. 3i
        return frozenset({token.lower(), f"-{token.lower()}"})

    # 3. System of equations e.g. "x = 2, y = 3" or "x = 2 and y = 3" or "x: 2, y: 3"
    system_pairs = re.findall(r"([a-zA-Z])\s*[:=]\s*([+-]?\d+(?:\.\d+)?|[+-]?\d+\s*/\s*\d+)", s)
    if len(system_pairs) >= 2:
        system_dict = {}
        for var, num_str in system_pairs:
            parsed_num = _try_parse_number(num_str)
            if parsed_num is not None:
                system_dict[var.lower()] = round(parsed_num, 5)
        if len(system_dict) == len(system_pairs):
            return tuple(sorted(system_dict.items()))

    # 4. Inequalities e.g. "x > 3", "x <= -2", "x >= 5"
    ineq_match = re.match(r"^([a-zA-Z])\s*(<=|>=|<|>|!=)\s*([+-]?\d+(?:\.\d+)?|[+-]?\d+\s*/\s*\d+)$", s)
    if ineq_match:
        var = ineq_match.group(1).lower()
        op = ineq_match.group(2)
        num = _try_parse_number(ineq_match.group(3))
        if num is not None:
            return ("INEQ", var, op, round(num, 5))

    # 5. Multiple solutions / list of roots e.g. "x = -3, 3" or "x = 2 or x = -2" or "{-3, 3}"
    content = re.sub(r"^[a-zA-Z]\s*=\s*", "", s).strip("{}[]()")
    parts = re.split(r",|\bor\b|\band\b|;", content)
    if len(parts) > 1:
        num_set = set()
        all_numeric = True
        for part in parts:
            part_clean = re.sub(r"^[a-zA-Z]\s*=\s*", "", part.strip())
            num = _try_parse_number(part_clean)
            if num is not None:
                num_set.add(round(num, 5))
            else:
                all_numeric = False
                break
        if all_numeric and len(num_set) > 0:
            return frozenset(num_set)

        # If not all numeric, check if it's complex roots like "3i, -3i" or "x = 3i, x = -3i"
        str_set = set()
        for part in parts:
            part_clean = re.sub(r"^[a-zA-Z]\s*=\s*", "", part.strip()).replace(" ", "").lower()
            if part_clean:
                str_set.add(part_clean)
        if len(str_set) > 1:
            return frozenset(str_set)

    # 6. Single number with optional variable assignment e.g. "x = -3" or "-3" or "x = -3.0" or "x = (1)/(2)"
    cleaned_s = re.sub(r"^[a-zA-Z]\s*=\s*", "", s).strip()
    single_num = _try_parse_number(cleaned_s)
    if single_num is not None:
        return round(single_num, 5)

    # 7. Fallback: string canonicalization (for expressions e.g. "2x", "cos(x)", "x^2 + C")
    # Strip "y = ", "f'(x) = ", etc.
    s_clean = re.sub(r"^(?:[a-zA-Z]\'(?:[a-zA-Z])?|[a-zA-Z])\s*=\s*", "", s)
    s_clean = s_clean.replace(" ", "").lower()
    return s_clean


def _compare_single(norm_act: Any, norm_exp: Any) -> bool:
    """Compare normalized actual vs normalized expected representation."""
    # Direct match
    if norm_act == norm_exp:
        return True

    # Numeric float comparison with small tolerance
    if isinstance(norm_exp, float) and isinstance(norm_act, float):
        return math.isclose(norm_act, norm_exp, abs_tol=1e-4)

    # If expected is a set with one element and actual is a float
    if isinstance(norm_exp, frozenset) and len(norm_exp) == 1 and isinstance(norm_act, float):
        single_exp = next(iter(norm_exp))
        if isinstance(single_exp, float):
            return math.isclose(norm_act, single_exp, abs_tol=1e-4)

    # If actual is a set with one element and expected is a float
    if isinstance(norm_act, frozenset) and len(norm_act) == 1 and isinstance(norm_exp, float):
        single_act = next(iter(norm_act))
        if isinstance(single_act, float):
            return math.isclose(single_act, norm_exp, abs_tol=1e-4)

    # If expected is a set of floats and actual is a set of floats
    if isinstance(norm_exp, frozenset) and isinstance(norm_act, frozenset):
        if len(norm_exp) == len(norm_act):
            unmatched = set(norm_exp)
            for act_item in norm_act:
                found = None
                for exp_item in unmatched:
                    if isinstance(act_item, float) and isinstance(exp_item, float):
                        if math.isclose(act_item, exp_item, abs_tol=1e-4):
                            found = exp_item
                            break
                    elif act_item == exp_item:
                        found = exp_item
                        break
                if found is not None:
                    unmatched.remove(found)
                else:
                    return False
            return len(unmatched) == 0

    return False


def compare_answers(actual: Any, expected: Any, accept: list[Any] | None = None) -> bool:
    """
    Compare an actual model answer against expected answer using normalized semantics.
    If 'accept' is provided, passes if actual matches 'expected' OR any entry in 'accept'.
    """
    norm_act = parse_normalized(actual)
    norm_exp = parse_normalized(expected)

    if _compare_single(norm_act, norm_exp):
        return True

    if accept and isinstance(accept, (list, tuple, set)):
        for alt in accept:
            norm_alt = parse_normalized(alt)
            if _compare_single(norm_act, norm_alt):
                return True

    return False
