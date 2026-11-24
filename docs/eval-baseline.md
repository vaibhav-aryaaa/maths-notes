# Evaluation Baseline (Task 72 Step 1 — Trustworthy Baseline)

**Date**: 2026-11-24  
**Fast Solver Model**: `gemini-3.5-flash-lite` (Gemini API, configured as `SOLVER_PROVIDER=gemini`)  
**Explain & Verification Model**: `gemini-3.5-flash` (Gemini API, configured as `EXPLAIN_PROVIDER=gemini`)  
**Run Configuration**: Full benchmark suite evaluated prior to introducing SymPy symbolic checker.

---

## 1. Architecture & Provider Decision

### Provider Decision for Launch
During baseline stress-testing, Groq free-tier on-demand accounts hit a hard daily cap of **200,000 tokens per day (TPD)**. At approximately ~2,300 tokens per vision request, this creates a hard quota cliff at approximately ~85 image solves per day across all users.

**Decision**:
- **Default Solver**: `SOLVER_PROVIDER=gemini` with `gemini-3.5-flash-lite` as the primary fast solver (sub-second latency, high daily capacity) and `gemini-3.5-flash` as the verifier.
- **Fallback**: Groq (`qwen/qwen3.8-27b`) is preserved as transparent fallback.
- **No Silent Fallback in Benchmarks**: The evaluation runner enforces 100% provider adherence during benchmark runs without silent switching.

### Provider Execution Counts
Across all 79 benchmark test evaluations in this baseline run:
- **Fast Solver Calls**: `gemini (gemini-3.5-flash-lite)`: **79 / 79 (100.0%)**
- **Explain Verifier Calls**: `gemini (gemini-3.5-flash)`: **79 / 79 (100.0%)**
- **429 Rate Limit Exceptions**: 0 (zero silent fallbacks)

---

## 2. Evaluation Suites

The benchmark partitions evaluations into three distinct suites to isolate OCR transcription noise from algebraic reasoning:

1. **Text Proxy Suite (49 cases)**: Evaluates mathematical reasoning directly through the fast solver and explain verifier using production OCR prompt specifications without vision distortion.
2. **Synthetic / Typed Suite (15 cases)**: Evaluates clean typography rendered with canvas styling (`evals/synthetic/`) to measure baseline vision capability under ideal typographic conditions.
3. **Real Canvas Handwritten Suite (15 cases)**: Evaluates genuine hand-drawn canvas drawings (`evals/handwritten/`), including real user canvas drawings (`cat1_01`), small messy writing (`cat6_03`), a crossed-out digit (`cat3_01`), and slanted lines (`cat9_01`).

---

## 3. Results Summary: Fast vs After Verification

| Category | Text Proxy (Fast → Final) | Synthetic Typed (Fast → Final) | Real Canvas HW (Fast → Final) |
| :--- | :---: | :---: | :---: |
| **Extraneous Roots from Cancelling** | 4/5 → 5/5 (100%) | 2/3 → 2/3 (66.7%) | 3/3 → 3/3 (100%) |
| **Domain Exclusions** | 5/5 → 5/5 (100%) | 2/2 → 2/2 (100%) | 2/2 → 2/2 (100%) |
| **Quadratics (Two Roots / No Real Roots)** | 5/5 → 5/5 (100%) | 2/3 → 3/3 (100%) | 3/3 → 3/3 (100%) |
| **Sign Errors & Negative Numbers** | 5/5 → 5/5 (100%) | 1/1 → 1/1 (100%) | 1/1 → 1/1 (100%) |
| **Fractions and Decimals** | 5/5 → 5/5 (100%) | 1/1 → 1/1 (100%) | 1/1 → 1/1 (100%) |
| **Absolute Value** | 5/5 → 5/5 (100%) | 2/2 → 2/2 (100%) | 2/2 → 2/2 (100%) |
| **Linear Systems** | 5/5 → 5/5 (100%) | 1/1 → 1/1 (100%) | 0/1 → 1/1 (100%) |
| **Simple Derivatives & Integrals** | 5/5 → 5/5 (100%) | 1/1 → 1/1 (100%) | 1/1 → 1/1 (100%) |
| **Inequalities** | 5/5 → 5/5 (100%) | 1/1 → 1/1 (100%) | 0/1 → 0/1 (0.0%) |
| **Word Problems** | 4/4 → 4/4 (100%) | N/A | N/A |

### Suite Totals
- **Text Proxy Suite**: Fast: **48 / 49 (98.0%)** | After Verification: **49 / 49 (100.0%)**
- **Synthetic Typed Suite**: Fast: **13 / 15 (86.7%)** | After Verification: **14 / 15 (93.3%)**
- **Real Canvas Handwritten**: Fast: **13 / 15 (86.7%)** | After Verification: **14 / 15 (93.3%)**
- **Combined Benchmark Overall**: Fast: **74 / 79 (93.7%)** | After Verification: **77 / 79 (97.5%)**

---

## 4. Key Verification Findings (Task 71 Effect)

Task 71's independent verification successfully caught and corrected multiple fast-solver mistakes:
- **`cat1_01` (Text Proxy)**: $(x^2 - 9)/(x - 3) = 0$. Fast solver returned `No solution` (prematurely excluding valid roots). Verification caught the error, set `agrees: false`, and corrected the solution to $x = -3$.
- **`cat7_01` (Real Handwritten)**: $x + y = 10,\; x - y = 2$. Fast solver returned $x = 6, y = -2$ (algebra sign error on $y$). Verification caught the error, set `agrees: false`, and corrected the solution to $x = 6, y = 4$.
- **`cat3_03` (Synthetic)**: $x^2 + 9 = 0$. Fast solver returned unnormalized string, verification corrected it to $x = 3i, -3i$.

---

## 5. Domain Rules & Expected Answers Decisions

1. **Integration Constants ($\int 2x\,dx$)**:
   - `expected`: `x^2`, `accept`: `["x^2 + C", "x^2+C", "x^2 + c"]`.
   - *Rationale*: In introductory calculus, including the constant of integration $+ C$ is standard mathematical practice and should be credited.
2. **Quadratics with No Real Roots ($x^2 + 9 = 0$ and $x^2 + 2x + 5 = 0$)**:
   - `expected`: `no real solution`, `accept`: complex root pairs (`["x = 3i, x = -3i"]` and `["-1 + 2i, -1 - 2i"]`).
   - *Rationale*: A student in secondary algebra expects "no real solution", while advanced students expect complex roots. Both are mathematically sound representations.

---

## 6. Failure Triage: Solver Error vs Test Design

Only **2 cases** failed after verification across all 79 evaluations:

1. **`cat1_04` (Synthetic Typed) — Solver Error**:
   - Problem: $(x^2 - 5x + 6)/(x - 2) = 0$
   - Expected: `3`
   - Got: `x - 3`
   - *Triage*: The model simplified the rational expression to $x - 3$ rather than completing the solve step for $x = 3$. This is a genuine LLM reasoning error that Step 2's symbolic checker (SymPy) will deterministically prevent.
2. **`cat9_01` (Real Handwritten) — OCR / Transcription Error**:
   - Problem: $2x - 4 > 6$ (rendered with slanted strokes at an upward angle)
   - Expected: `x > 5`
   - Got: `> 5`
   - *Triage*: The vision model correctly solved the inequality $(> 5)$ but dropped the variable name `x` due to the tilt of the handwritten strokes.

---

## 7. Commands to Reproduce

Run the full benchmark at any time:
```bash
cd maths-note-be
source venv/bin/activate
python evals/run_eval.py --mode all
```
Or individual suites:
```bash
python evals/run_eval.py --mode text
python evals/run_eval.py --mode synthetic
python evals/run_eval.py --mode handwritten
```
Run normalizer unit tests:
```bash
python -m pytest evals/test_normalize.py
```
Check code formatting & lint:
```bash
ruff check evals/
ruff format --check evals/
```
