import argparse
import copy
import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from typing import Any

from PIL import Image

# Ensure maths-note-be is in python path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from google.genai import types

from apps.calculator.utils import (
    _analyze_image_gemini,
    _analyze_image_groq,
    _build_explain_prompt,
    _explain_result_gemini,
    _explain_result_groq,
    _validate_and_sanitize_verification,
    gemini_client,
    groq_client,
)
from constants import (
    EXPLAIN_PROVIDER,
    GEMINI_MODEL_EXPLAIN,
    GEMINI_MODEL_FAST,
    GROQ_VISION_MODEL,
    SOLVER_PROVIDER,
)
from evals.normalize import compare_answers

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("eval_runner")


def _format_solutions_to_answer(answers_list: list[dict[str, Any]]) -> str:
    """Format a list of solver answers into a normalized answer string."""
    if not answers_list:
        return ""
    if len(answers_list) == 1:
        res = answers_list[0].get("result")
        return str(res) if res is not None else ""

    # If multiple solutions e.g. system of equations [x=6, y=4]
    pairs = []
    for item in answers_list:
        expr = item.get("expr") or ""
        res = item.get("result")
        if expr and expr != "ans" and not expr.isdigit():
            pairs.append(f"{expr} = {res}")
        else:
            pairs.append(str(res))
    return ", ".join(pairs)


def call_fast_text_solver(problem: str, solver_provider: str = SOLVER_PROVIDER) -> tuple[list[dict[str, Any]], str]:
    """
    Direct text fast solver matching production prompt instructions.
    Does not silently fallback to another provider.
    """
    provider = solver_provider
    provider_name = f"{provider} ({GROQ_VISION_MODEL if provider == 'groq' else GEMINI_MODEL_FAST})"

    prompt = (
        f"You are a fast, high-accuracy mathematical OCR and solving engine. "
        f"Analyze and solve the mathematical problem: {problem}\n\n"
        f"User-assigned variables: {{}}.\n"
        f"Rules:\n"
        f"1. Follow standard PEMDAS order of operations.\n"
        f"2. For equations (e.g. 4x = 16 or linear systems), solve for the variable(s).\n"
        f"3. Return a JSON list of objects. Each object MUST contain:\n"
        f"   - 'expr': the variable or expression solved (e.g. 'x' or '2+3')\n"
        f"   - 'result': the computed numeric or algebraic answer (e.g. 4, 5, or '17/12'. Always put fractions, strings, and expressions in double quotes)\n"
        f"   - 'type': 'math'\n"
        f"   - 'assign': true if a variable was solved or assigned, false otherwise\n"
        f"   - 'confidence_score': integer between 0 and 100\n\n"
        f"CRITICAL: Return ONLY the raw JSON array or an object with an 'answers' list. DO NOT use markdown or code fences."
    )

    if provider == "groq":
        if not groq_client:
            raise ValueError("GROQ_API_KEY is not configured.")
        try:
            res = groq_client.chat.completions.create(
                model=GROQ_VISION_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            raw_text = res.choices[0].message.content or ""
        except Exception as e:
            err_msg = str(e)
            if "429" in err_msg or "rate_limit" in err_msg:
                # Check retry-after
                m = re.search(r"try again in (\d+(?:\.\d+)?)s", err_msg)
                if m:
                    wait_sec = float(m.group(1)) + 2.0
                    print(f" [Groq Rate Limit] Waiting {wait_sec:.1f}s...")
                    time.sleep(wait_sec)
                    res = groq_client.chat.completions.create(
                        model=GROQ_VISION_MODEL,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1,
                        response_format={"type": "json_object"},
                    )
                    raw_text = res.choices[0].message.content or ""
                else:
                    raise RuntimeError(f"Groq daily or rate limit reached: {e}")
            else:
                raise
    else:
        # Gemini text call
        if not gemini_client:
            raise ValueError("GEMINI_API_KEY is not configured.")
        res = gemini_client.models.generate_content(
            model=GEMINI_MODEL_FAST,
            contents=[prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        raw_text = res.text or ""

    # Parse JSON list
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        data = json.loads(cleaned)
    except Exception:
        data = [{"expr": "ans", "result": cleaned}]

    if isinstance(data, dict):
        if "answers" in data and isinstance(data["answers"], list):
            answers = data["answers"]
        elif "result" in data:
            answers = [data]
        else:
            answers = [data]
    elif isinstance(data, list):
        answers = data
    else:
        answers = [{"expr": "ans", "result": str(data)}]

    return answers, provider_name


def call_explain_text_verifier(
    problem: str, fast_answers: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], bool, str | None, str]:
    """
    Direct text explain verifier (Task 71) without sending blank images.
    """
    provider = EXPLAIN_PROVIDER
    provider_name = f"{provider} ({GEMINI_MODEL_EXPLAIN if provider == 'gemini' else 'groq'})"

    expr = fast_answers[0].get("expr", problem) if fast_answers else problem
    result = fast_answers[0].get("result", "") if fast_answers else ""

    prompt = _build_explain_prompt(
        expr=expr,
        result=result,
        dict_of_vars={},
        solutions=fast_answers,
        type="math",
    )
    # Adjust prompt instruction for text context
    prompt = prompt.replace(
        "You are given an image with mathematical expressions", f"You are given the mathematical problem: {problem}"
    )
    prompt = prompt.replace("from the image first.", "step by step first.")

    if provider == "gemini":
        if not gemini_client:
            raise ValueError("GEMINI_API_KEY is not configured.")
        res = gemini_client.models.generate_content(
            model=GEMINI_MODEL_EXPLAIN,
            contents=[prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        raw_text = res.text or ""
    else:
        if not groq_client:
            raise ValueError("GROQ_API_KEY is not configured.")
        res = groq_client.chat.completions.create(
            model=GROQ_VISION_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw_text = res.choices[0].message.content or ""

    cleaned = raw_text.strip()
    try:
        explanation = json.loads(cleaned)
    except Exception:
        explanation = {"verification": {"agrees": True, "corrected_answers": None, "confidence": 95, "note": None}}

    explanation = _validate_and_sanitize_verification(
        explanation,
        num_solutions=len(fast_answers),
        problem_type="math",
        provider=provider,
    )
    verification = explanation.get("verification") or {}
    agrees = verification.get("agrees", True)
    corrected = verification.get("corrected_answers")
    note = verification.get("note")

    final_answers = copy.deepcopy(fast_answers)
    if not agrees and corrected and len(corrected) > 0:
        for idx, corr_val in enumerate(corrected):
            if idx < len(final_answers):
                final_answers[idx]["result"] = corr_val
            else:
                final_answers.append({"expr": f"x_{idx + 1}", "result": corr_val})

    return final_answers, agrees, note, provider_name


def solve_image_problem(
    image_path: str, solver_provider: str = SOLVER_PROVIDER
) -> tuple[str, str, bool, str | None, str, str]:
    """
    Solves an image using production analyze_image + explain_result pipeline.
    Does not silently fallback; preserves full multi-solution pairs.
    """
    img = Image.open(image_path)
    fast_provider = f"{solver_provider} ({GROQ_VISION_MODEL if solver_provider == 'groq' else GEMINI_MODEL_FAST})"

    # 1. Fast call (strictly respect solver_provider without silent fallback)
    if solver_provider == "groq":
        fast_answers = _analyze_image_groq(img, {})
    else:
        fast_answers = _analyze_image_gemini(img, {})

    fast_answer_str = _format_solutions_to_answer(fast_answers)

    # 2. Explain call
    time.sleep(1.0)
    explain_provider = f"{EXPLAIN_PROVIDER} ({GEMINI_MODEL_EXPLAIN if EXPLAIN_PROVIDER == 'gemini' else 'groq'})"
    expr = fast_answers[0].get("expr", "") if fast_answers else ""
    result = fast_answers[0].get("result") if fast_answers else ""
    sol_type = fast_answers[0].get("type", "math") if fast_answers else "math"

    if EXPLAIN_PROVIDER == "gemini":
        explanation = _explain_result_gemini(img, {}, expr, result, type=sol_type, solutions=fast_answers)
    else:
        explanation = _explain_result_groq(img, {}, expr, result, type=sol_type, solutions=fast_answers)

    verification = explanation.get("verification") or {}
    agrees = verification.get("agrees", True)
    corrected = verification.get("corrected_answers")
    note = verification.get("note")

    final_answers = copy.deepcopy(fast_answers)
    if not agrees and corrected and len(corrected) > 0:
        for idx, corr_val in enumerate(corrected):
            if idx < len(final_answers):
                final_answers[idx]["result"] = corr_val
            else:
                final_answers.append({"expr": f"x_{idx + 1}", "result": corr_val})

    final_answer_str = _format_solutions_to_answer(final_answers)
    return final_answer_str, fast_answer_str, agrees, note, fast_provider, explain_provider


def run_evals(mode: str = "all", limit: int | None = None, solver_provider: str | None = None):
    active_solver = solver_provider or SOLVER_PROVIDER
    cases_path = os.path.join(os.path.dirname(__file__), "cases.json")
    with open(cases_path) as f:
        cases = json.load(f)

    if limit:
        cases = cases[:limit]

    fast_model_label = GROQ_VISION_MODEL if active_solver == "groq" else GEMINI_MODEL_FAST
    print("============================================================")
    print("EVALUATION RUNNER (Task 72 Step 1 Trustworthy Baseline)")
    print(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Configured Fast Solver: {active_solver} ({fast_model_label})")
    print(
        f"Configured Explain Verifier: {EXPLAIN_PROVIDER} ({GEMINI_MODEL_EXPLAIN if EXPLAIN_PROVIDER == 'gemini' else 'groq'})"
    )
    print(f"Mode: {mode.upper()} | Total Cases in Pool: {len(cases)}")
    print("============================================================\n")

    provider_counts = {"fast": defaultdict(int), "explain": defaultdict(int)}
    results_by_suite = {"text": [], "synthetic": [], "handwritten": []}
    failures = []

    # 1. TEXT PROXY SUITE
    if mode in ("all", "text"):
        print(f"--- RUNNING TEXT PROXY SUITE ({len(cases)} cases) ---")
        for idx, case in enumerate(cases, 1):
            cid = case["id"]
            cat = case["category"]
            prob = case["problem"]
            expected = case["expected"]
            accept = case.get("accept", [])

            try:
                fast_ans_list, fp_name = call_fast_text_solver(prob, solver_provider=active_solver)
                provider_counts["fast"][fp_name] += 1
                fast_str = _format_solutions_to_answer(fast_ans_list)
                fast_pass = compare_answers(fast_str, expected, accept=accept)

                time.sleep(1.0)
                final_ans_list, agrees, note, ep_name = call_explain_text_verifier(prob, fast_ans_list)
                provider_counts["explain"][ep_name] += 1
                final_str = _format_solutions_to_answer(final_ans_list)
                final_pass = compare_answers(final_str, expected, accept=accept)

                status_str = "PASS" if final_pass else "FAIL"
                fast_status = "PASS" if fast_pass else "FAIL"
                print(f"[{idx:02d}/{len(cases):02d}] {status_str} (Fast: {fast_status}) | {cid} | {cat}")
                print(f"   Problem:  {prob}")
                print(f"   Expected: {expected} | Fast: {fast_str} | Final: {final_str} (Agrees: {agrees})")
                if not final_pass:
                    print(f"   --> FAILED: Got '{final_str}', expected '{expected}' (Accept: {accept}, Note: {note})")
                    failures.append(
                        {
                            "suite": "text_proxy",
                            "id": cid,
                            "category": cat,
                            "problem": prob,
                            "expected": str(expected),
                            "accept": accept,
                            "fast_answer": fast_str,
                            "fast_pass": fast_pass,
                            "final_answer": final_str,
                            "final_pass": final_pass,
                            "agrees": agrees,
                            "note": note,
                        }
                    )

                results_by_suite["text"].append(
                    {
                        "case": case,
                        "fast_pass": fast_pass,
                        "final_pass": final_pass,
                        "fast_str": fast_str,
                        "final_str": final_str,
                    }
                )
            except Exception as e:
                print(f"[{idx:02d}/{len(cases):02d}] ERROR | {cid} | {e}")
                failures.append(
                    {
                        "suite": "text_proxy",
                        "id": cid,
                        "category": cat,
                        "problem": prob,
                        "expected": str(expected),
                        "error": str(e),
                    }
                )
                results_by_suite["text"].append(
                    {"case": case, "fast_pass": False, "final_pass": False, "error": str(e)}
                )

            time.sleep(1.0)
        print()

    # 2. SYNTHETIC (TYPED / FONT-RENDERED) SUITE
    if mode in ("all", "synthetic"):
        synth_cases = [c for c in cases if c.get("has_handwritten_crop")]
        print(f"--- RUNNING SYNTHETIC TYPED/FONT SUITE ({len(synth_cases)} cases) ---")
        for idx, case in enumerate(synth_cases, 1):
            cid = case["id"]
            cat = case["category"]
            prob = case["problem"]
            expected = case["expected"]
            accept = case.get("accept", [])
            crop_file = case["crop_file"]
            img_path = os.path.join(os.path.dirname(__file__), "synthetic", crop_file)

            try:
                final_str, fast_str, agrees, note, fp_name, ep_name = solve_image_problem(
                    img_path, solver_provider=active_solver
                )
                provider_counts["fast"][fp_name] += 1
                provider_counts["explain"][ep_name] += 1

                fast_pass = compare_answers(fast_str, expected, accept=accept)
                final_pass = compare_answers(final_str, expected, accept=accept)

                status_str = "PASS" if final_pass else "FAIL"
                fast_status = "PASS" if fast_pass else "FAIL"
                print(f"[{idx:02d}/{len(synth_cases):02d}] {status_str} (Fast: {fast_status}) | {cid} | {cat}")
                print(f"   Crop:     synthetic/{crop_file}")
                print(f"   Expected: {expected} | Fast: {fast_str} | Final: {final_str} (Agrees: {agrees})")
                if not final_pass:
                    print(f"   --> FAILED: Got '{final_str}', expected '{expected}' (Note: {note})")
                    failures.append(
                        {
                            "suite": "synthetic",
                            "id": cid,
                            "category": cat,
                            "problem": prob,
                            "crop_file": f"synthetic/{crop_file}",
                            "expected": str(expected),
                            "accept": accept,
                            "fast_answer": fast_str,
                            "fast_pass": fast_pass,
                            "final_answer": final_str,
                            "final_pass": final_pass,
                            "agrees": agrees,
                            "note": note,
                        }
                    )

                results_by_suite["synthetic"].append(
                    {
                        "case": case,
                        "fast_pass": fast_pass,
                        "final_pass": final_pass,
                        "fast_str": fast_str,
                        "final_str": final_str,
                    }
                )
            except Exception as e:
                print(f"[{idx:02d}/{len(synth_cases):02d}] ERROR | {cid} | {e}")
                failures.append(
                    {
                        "suite": "synthetic",
                        "id": cid,
                        "category": cat,
                        "problem": prob,
                        "crop_file": f"synthetic/{crop_file}",
                        "expected": str(expected),
                        "error": str(e),
                    }
                )
                results_by_suite["synthetic"].append(
                    {"case": case, "fast_pass": False, "final_pass": False, "error": str(e)}
                )

            time.sleep(1.0)
        print()

    # 3. REAL CANVAS HANDWRITTEN SUITE
    if mode in ("all", "handwritten"):
        hw_cases = [c for c in cases if c.get("has_handwritten_crop")]
        print(f"--- RUNNING REAL CANVAS HANDWRITTEN SUITE ({len(hw_cases)} cases) ---")
        for idx, case in enumerate(hw_cases, 1):
            cid = case["id"]
            cat = case["category"]
            prob = case["problem"]
            expected = case["expected"]
            accept = case.get("accept", [])
            crop_file = case["crop_file"]
            img_path = os.path.join(os.path.dirname(__file__), "handwritten", crop_file)

            try:
                final_str, fast_str, agrees, note, fp_name, ep_name = solve_image_problem(
                    img_path, solver_provider=active_solver
                )
                provider_counts["fast"][fp_name] += 1
                provider_counts["explain"][ep_name] += 1

                fast_pass = compare_answers(fast_str, expected, accept=accept)
                final_pass = compare_answers(final_str, expected, accept=accept)

                status_str = "PASS" if final_pass else "FAIL"
                fast_status = "PASS" if fast_pass else "FAIL"
                print(f"[{idx:02d}/{len(hw_cases):02d}] {status_str} (Fast: {fast_status}) | {cid} | {cat}")
                print(f"   Crop:     handwritten/{crop_file}")
                print(f"   Expected: {expected} | Fast: {fast_str} | Final: {final_str} (Agrees: {agrees})")
                if not final_pass:
                    print(f"   --> FAILED: Got '{final_str}', expected '{expected}' (Note: {note})")
                    failures.append(
                        {
                            "suite": "handwritten",
                            "id": cid,
                            "category": cat,
                            "problem": prob,
                            "crop_file": f"handwritten/{crop_file}",
                            "expected": str(expected),
                            "accept": accept,
                            "fast_answer": fast_str,
                            "fast_pass": fast_pass,
                            "final_answer": final_str,
                            "final_pass": final_pass,
                            "agrees": agrees,
                            "note": note,
                        }
                    )

                results_by_suite["handwritten"].append(
                    {
                        "case": case,
                        "fast_pass": fast_pass,
                        "final_pass": final_pass,
                        "fast_str": fast_str,
                        "final_str": final_str,
                    }
                )
            except Exception as e:
                print(f"[{idx:02d}/{len(hw_cases):02d}] ERROR | {cid} | {e}")
                failures.append(
                    {
                        "suite": "handwritten",
                        "id": cid,
                        "category": cat,
                        "problem": prob,
                        "crop_file": f"handwritten/{crop_file}",
                        "expected": str(expected),
                        "error": str(e),
                    }
                )
                results_by_suite["handwritten"].append(
                    {"case": case, "fast_pass": False, "final_pass": False, "error": str(e)}
                )

            time.sleep(1.0)
        print()

    # SUMMARY REPORT
    print("==========================================================================================")
    print("EVALUATION RESULTS SUMMARY (Fast vs After Verification)")
    print("==========================================================================================")
    print("PROVIDER COUNTS PER RUN:")
    print("  Fast Solver:    ", dict(provider_counts["fast"]))
    print("  Explain Verifier:", dict(provider_counts["explain"]))
    print("------------------------------------------------------------------------------------------")

    # Aggregate by category
    cats = sorted(list(set(c["category"] for c in cases)))
    cat_stats = {
        cat: {
            "text_fast": 0,
            "text_final": 0,
            "text_total": 0,
            "synth_fast": 0,
            "synth_final": 0,
            "synth_total": 0,
            "hw_fast": 0,
            "hw_final": 0,
            "hw_total": 0,
        }
        for cat in cats
    }

    for item in results_by_suite["text"]:
        cat = item["case"]["category"]
        cat_stats[cat]["text_total"] += 1
        if item["fast_pass"]:
            cat_stats[cat]["text_fast"] += 1
        if item["final_pass"]:
            cat_stats[cat]["text_final"] += 1

    for item in results_by_suite["synthetic"]:
        cat = item["case"]["category"]
        cat_stats[cat]["synth_total"] += 1
        if item["fast_pass"]:
            cat_stats[cat]["synth_fast"] += 1
        if item["final_pass"]:
            cat_stats[cat]["synth_final"] += 1

    for item in results_by_suite["handwritten"]:
        cat = item["case"]["category"]
        cat_stats[cat]["hw_total"] += 1
        if item["fast_pass"]:
            cat_stats[cat]["hw_fast"] += 1
        if item["final_pass"]:
            cat_stats[cat]["hw_final"] += 1

    header = (
        f"{'Category':<32} | {'Text Proxy (Fast/Fin)':<22} | {'Synthetic (Fast/Fin)':<21} | {'Real HW (Fast/Fin)':<20}"
    )
    print(header)
    print("-" * len(header))
    for cat in cats:
        s = cat_stats[cat]
        t_str = (
            f"{s['text_fast']}/{s['text_total']} -> {s['text_final']}/{s['text_total']}" if s["text_total"] else "N/A"
        )
        sy_str = (
            f"{s['synth_fast']}/{s['synth_total']} -> {s['synth_final']}/{s['synth_total']}"
            if s["synth_total"]
            else "N/A"
        )
        hw_str = f"{s['hw_fast']}/{s['hw_total']} -> {s['hw_final']}/{s['hw_total']}" if s["hw_total"] else "N/A"
        print(f"{cat:<32} | {t_str:<22} | {sy_str:<21} | {hw_str:<20}")

    print("-" * len(header))

    # Totals
    def sum_key(k):
        return sum(cat_stats[c][k] for c in cats)

    tf, tfin, tt = sum_key("text_fast"), sum_key("text_final"), sum_key("text_total")
    sf, sfin, st = sum_key("synth_fast"), sum_key("synth_final"), sum_key("synth_total")
    hf, hfin, ht = sum_key("hw_fast"), sum_key("hw_final"), sum_key("hw_total")

    if tt > 0:
        print(
            f"Overall Text Proxy:        Fast: {tf}/{tt} ({tf / tt * 100:.1f}%)  |  After Verification: {tfin}/{tt} ({tfin / tt * 100:.1f}%)"
        )
    if st > 0:
        print(
            f"Overall Synthetic (Typed): Fast: {sf}/{st} ({sf / st * 100:.1f}%)  |  After Verification: {sfin}/{st} ({sfin / st * 100:.1f}%)"
        )
    if ht > 0:
        print(
            f"Overall Real Handwritten:  Fast: {hf}/{ht} ({hf / ht * 100:.1f}%)  |  After Verification: {hfin}/{ht} ({hfin / ht * 100:.1f}%)"
        )

    comb_fast = tf + sf + hf
    comb_final = tfin + sfin + hfin
    comb_total = tt + st + ht
    if comb_total > 0:
        print(
            f"Combined Benchmark Total:  Fast: {comb_fast}/{comb_total} ({comb_fast / comb_total * 100:.1f}%)  |  After Verification: {comb_final}/{comb_total} ({comb_final / comb_total * 100:.1f}%)"
        )
    print(f"Total Failures (After Verification): {len(failures)}")

    if failures:
        print("\n--- FAILURE TRIAGE (Solver Error vs Test Design) ---")
        for f_item in failures:
            tag = f"[{f_item['suite'].upper()}]"
            print(f"- {tag} {f_item['id']} ({f_item['category']}): {f_item['problem']}")
            print(f"    Expected: {f_item.get('expected')} (Accept: {f_item.get('accept')})")
            print(
                f"    Got:      Final: {f_item.get('final_answer')} (Fast: {f_item.get('fast_answer')}, Agreed: {f_item.get('agrees')})"
            )
            if f_item.get("note"):
                print(f"    Note:     {f_item['note']}")
            if f_item.get("error"):
                print(f"    Error:    {f_item['error']}")
    print("==========================================================================================\n")

    return {
        "provider_counts": provider_counts,
        "cat_stats": cat_stats,
        "failures": failures,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Math solver evaluation runner")
    parser.add_argument("--mode", choices=["all", "text", "synthetic", "handwritten"], default="all")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--provider", choices=["groq", "gemini"], default=None, help="Override fast solver provider")
    args = parser.parse_args()

    run_evals(mode=args.mode, limit=args.limit, solver_provider=args.provider)
