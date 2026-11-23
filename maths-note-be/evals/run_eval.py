import argparse
import json
import logging
import os
import sys
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

# Ensure maths-note-be is in python path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from apps.calculator.utils import (
    analyze_image,
    explain_result,
    _generate_groq_vision_content,
    _pil_to_base64_url,
)
from constants import (
    GROQ_API_KEY,
    GROQ_VISION_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL_EXPLAIN,
    SOLVER_PROVIDER,
    EXPLAIN_PROVIDER,
)
from evals.normalize import compare_answers

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("eval_runner")


def solve_text_problem(problem: str) -> Tuple[Any, str, bool, Optional[str]]:
    """
    Simulates the text solving path:
    1. Fast call: Groq (or Gemini fallback) solves the problem as text.
    2. Explain call (Task 71): Gemini independently verifies the solution.
    Returns: (final_answer, raw_fast_answer, explain_agreed, explain_note)
    """
    dummy_img = Image.new("RGB", (64, 64), color="white")
    
    # 1. Fast solve call
    fast_prompt = (
        f"You are a fast, high-accuracy mathematical solving engine.\n"
        f"Solve the following mathematical problem: {problem}\n"
        f"Rules:\n"
        f"1. Follow standard mathematical rules and PEMDAS order of operations.\n"
        f"2. For equations, solve for the variable.\n"
        f"3. Return ONLY a JSON object with keys: 'expr' (str) and 'result' (numeric or string answer).\n"
        f"CRITICAL: Do NOT use markdown code fences. Return ONLY the raw JSON object."
    )
    
    fast_raw = _generate_groq_vision_content(fast_prompt, dummy_img, model=GROQ_VISION_MODEL, as_json_object=True)
    try:
        fast_json = json.loads(fast_raw.strip())
        fast_result = fast_json.get("result", "")
        expr = fast_json.get("expr", problem)
    except Exception:
        # Fallback if json parsing fails
        fast_result = fast_raw.strip()
        expr = problem

    # 2. Explain call (Task 71 verification)
    time.sleep(1.0)  # Pacing to respect API rate limits
    explain_res = explain_result(
        dummy_img,
        {},
        expr,
        fast_result,
        type="math",
        solutions=[{"expr": expr, "result": fast_result}],
    )
    
    verification = explain_res.get("verification") or {}
    agrees = verification.get("agrees", True)
    corrected_answers = verification.get("corrected_answers")
    note = verification.get("note")

    final_answer = fast_result
    if not agrees and corrected_answers and len(corrected_answers) > 0:
        final_answer = corrected_answers[0]

    return final_answer, fast_result, agrees, note


def solve_image_problem(image_path: str) -> Tuple[Any, str, bool, Optional[str]]:
    """
    Solves a cropped handwriting image using the production /calculate endpoint logic:
    1. Fast call: analyze_image(img, {})
    2. Explain call (Task 71): explain_result(...)
    Returns: (final_answer, raw_fast_answer, explain_agreed, explain_note)
    """
    img = Image.open(image_path)
    
    # 1. Fast solve call
    results = analyze_image(img, {})
    if not results or len(results) == 0:
        return None, "", False, "No solution returned by analyze_image"

    first_res = results[0]
    fast_result = first_res.get("result")
    expr = first_res.get("expr", "")
    sol_type = first_res.get("type", "math")

    # 2. Explain call
    time.sleep(1.0)  # Pacing
    explain_res = explain_result(
        img,
        {},
        expr,
        fast_result,
        type=sol_type,
        solutions=[{"expr": expr, "result": fast_result}],
    )

    verification = explain_res.get("verification") or {}
    agrees = verification.get("agrees", True)
    corrected_answers = verification.get("corrected_answers")
    note = verification.get("note")

    final_answer = fast_result
    if not agrees and corrected_answers and len(corrected_answers) > 0:
        final_answer = corrected_answers[0]

    return final_answer, fast_result, agrees, note


def run_evals(mode: str = "all", limit: Optional[int] = None):
    cases_path = os.path.join(os.path.dirname(__file__), "cases.json")
    with open(cases_path, "r") as f:
        cases = json.load(f)

    if limit:
        cases = cases[:limit]

    print(f"============================================================")
    print(f"EVALUATION RUNNER (Task 72 Step 1 Baseline)")
    print(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Fast Solver Provider: {SOLVER_PROVIDER} ({GROQ_VISION_MODEL})")
    print(f"Explain Provider: {EXPLAIN_PROVIDER} ({GEMINI_MODEL_EXPLAIN})")
    print(f"Mode: {mode.upper()} | Total Cases in Pool: {len(cases)}")
    print(f"============================================================\n")

    text_results = []
    image_results = []
    failures = []

    # 1. Text-level run
    if mode in ("all", "text"):
        print(f"--- RUNNING TEXT-LEVEL EVALUATIONS ({len(cases)} cases) ---")
        for idx, case in enumerate(cases, 1):
            cid = case["id"]
            cat = case["category"]
            prob = case["problem"]
            expected = case["expected"]

            try:
                final_ans, fast_ans, agrees, note = solve_text_problem(prob)
                passed = compare_answers(final_ans, expected)
                status_str = "PASS" if passed else "FAIL"
                print(f"[{idx:02d}/{len(cases):02d}] {status_str} | ID: {cid} | Cat: {cat}")
                print(f"   Problem:  {prob}")
                print(f"   Expected: {expected} | Final: {final_ans} (Fast: {fast_ans}, Agrees: {agrees})")
                if not passed:
                    print(f"   --> FAILED: Got '{final_ans}', expected '{expected}' (Note: {note})")
                    failures.append({
                        "mode": "text",
                        "id": cid,
                        "category": cat,
                        "problem": prob,
                        "expected": str(expected),
                        "fast_answer": str(fast_ans),
                        "explain_agreed": agrees,
                        "final_answer": str(final_ans),
                        "note": note,
                    })
                text_results.append({"case": case, "passed": passed, "final": final_ans})
            except Exception as e:
                print(f"[{idx:02d}/{len(cases):02d}] ERROR | ID: {cid} | Error: {e}")
                failures.append({
                    "mode": "text",
                    "id": cid,
                    "category": cat,
                    "problem": prob,
                    "expected": str(expected),
                    "error": str(e),
                })
                text_results.append({"case": case, "passed": False, "error": str(e)})

            time.sleep(1.0)
        print()

    # 2. Handwritten run
    if mode in ("all", "handwritten"):
        hw_cases = [c for c in cases if c.get("has_handwritten_crop")]
        print(f"--- RUNNING HANDWRITTEN EVALUATIONS ({len(hw_cases)} cases) ---")
        for idx, case in enumerate(hw_cases, 1):
            cid = case["id"]
            cat = case["category"]
            prob = case["problem"]
            expected = case["expected"]
            crop_file = case["crop_file"]
            img_path = os.path.join(os.path.dirname(__file__), "handwritten", crop_file)

            try:
                final_ans, fast_ans, agrees, note = solve_image_problem(img_path)
                passed = compare_answers(final_ans, expected)
                status_str = "PASS" if passed else "FAIL"
                print(f"[{idx:02d}/{len(hw_cases):02d}] {status_str} | ID: {cid} | Cat: {cat}")
                print(f"   Crop:     {crop_file}")
                print(f"   Expected: {expected} | Final: {final_ans} (Fast: {fast_ans}, Agrees: {agrees})")
                if not passed:
                    print(f"   --> FAILED: Got '{final_ans}', expected '{expected}' (Note: {note})")
                    failures.append({
                        "mode": "handwritten",
                        "id": cid,
                        "category": cat,
                        "problem": prob,
                        "crop_file": crop_file,
                        "expected": str(expected),
                        "fast_answer": str(fast_ans),
                        "explain_agreed": agrees,
                        "final_answer": str(final_ans),
                        "note": note,
                    })
                image_results.append({"case": case, "passed": passed, "final": final_ans})
            except Exception as e:
                print(f"[{idx:02d}/{len(hw_cases):02d}] ERROR | ID: {cid} | Error: {e}")
                failures.append({
                    "mode": "handwritten",
                    "id": cid,
                    "category": cat,
                    "problem": prob,
                    "crop_file": crop_file,
                    "expected": str(expected),
                    "error": str(e),
                })
                image_results.append({"case": case, "passed": False, "error": str(e)})

            time.sleep(1.0)
        print()

    # Summary Statistics
    print("============================================================")
    print("EVALUATION RESULTS SUMMARY")
    print("============================================================")
    
    # Category Breakdown
    cat_stats = defaultdict(lambda: {"text_pass": 0, "text_total": 0, "hw_pass": 0, "hw_total": 0})
    for tr in text_results:
        c = tr["case"]["category"]
        cat_stats[c]["text_total"] += 1
        if tr["passed"]:
            cat_stats[c]["text_pass"] += 1

    for ir in image_results:
        c = ir["case"]["category"]
        cat_stats[c]["hw_total"] += 1
        if ir["passed"]:
            cat_stats[c]["hw_pass"] += 1

    header = f"{'Category':<35} | {'Text Acc':<12} | {'HW Acc':<12} | {'Total':<10}"
    print(header)
    print("-" * len(header))
    for cat, s in sorted(cat_stats.items()):
        t_str = f"{s['text_pass']}/{s['text_total']}" if s["text_total"] else "N/A"
        hw_str = f"{s['hw_pass']}/{s['hw_total']}" if s["hw_total"] else "N/A"
        tot_pass = s["text_pass"] + s["hw_pass"]
        tot_all = s["text_total"] + s["hw_total"]
        pct = (tot_pass / tot_all * 100) if tot_all else 0
        tot_str = f"{tot_pass}/{tot_all} ({pct:.1f}%)"
        print(f"{cat:<35} | {t_str:<12} | {hw_str:<12} | {tot_str:<10}")

    total_text_pass = sum(s["text_pass"] for s in cat_stats.values())
    total_text = sum(s["text_total"] for s in cat_stats.values())
    total_hw_pass = sum(s["hw_pass"] for s in cat_stats.values())
    total_hw = sum(s["hw_total"] for s in cat_stats.values())

    print("-" * len(header))
    if total_text > 0:
        print(f"Overall Text Accuracy:        {total_text_pass}/{total_text} ({total_text_pass/total_text*100:.1f}%)")
    if total_hw > 0:
        print(f"Overall Handwritten Accuracy: {total_hw_pass}/{total_hw} ({total_hw_pass/total_hw*100:.1f}%)")
    overall_pass = total_text_pass + total_hw_pass
    overall_all = total_text + total_hw
    if overall_all > 0:
        print(f"Combined Overall Accuracy:    {overall_pass}/{overall_all} ({overall_pass/overall_all*100:.1f}%)")
    print(f"Total Failures:               {len(failures)}")

    if failures:
        print("\n--- FAILURE DETAILS ---")
        for f_item in failures:
            mode_tag = f"[{f_item['mode'].upper()}]"
            print(f"- {mode_tag} {f_item['id']} ({f_item['category']}): {f_item['problem']}")
            print(f"    Expected: {f_item.get('expected')}")
            print(f"    Got:      {f_item.get('final_answer')} (Fast: {f_item.get('fast_answer')}, Agreed: {f_item.get('explain_agreed')})")
            if f_item.get("note"):
                print(f"    Note:     {f_item['note']}")
            if f_item.get("error"):
                print(f"    Error:    {f_item['error']}")
    print("============================================================\n")

    return {
        "text_pass": total_text_pass,
        "text_total": total_text,
        "hw_pass": total_hw_pass,
        "hw_total": total_hw,
        "failures": failures,
        "cat_stats": dict(cat_stats),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Math solver evaluation runner")
    parser.add_argument("--mode", choices=["all", "text", "handwritten"], default="all")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    run_evals(mode=args.mode, limit=args.limit)
