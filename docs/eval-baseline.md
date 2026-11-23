# Evaluation Baseline (Task 72 Step 1)

**Date**: 2026-11-23  
**Fast Solver Model**: `qwen/qwen3.8-27b` (Groq Vision / text completion)  
**Explain & Verification Model**: `gemini-3.5-flash` (Gemini API with Task 71 verification prompt)  
**Configuration**: Baseline run prior to integrating SymPy symbolic solver.

---

## 1. Overview and Methodology

This evaluation suite establishes an empirical baseline for the SolveIQ mathematical solving engine across 49 test cases categorized into 10 distinct mathematical domains (4–6 problems per category, including 4 word problems).

1. **Text-Level Evaluation (49 cases)**: Problems are evaluated directly through the fast solver engine followed by the Task 71 verification call. This tests mathematical reasoning and domain rule verification without visual OCR interference.
2. **Handwritten Canvas Evaluation (15 cases)**: 15 representative problems from the test suite are rendered/cropped as handwriting canvas images and passed through the production `/calculate` image pipeline. This isolates OCR transcription noise from algebraic reasoning.
3. **Equivalence Normalization**: Results are compared using `evals/normalize.py`, supporting:
   - Scalar equivalence (`x = -3`, `-3`, `-3.0`, `−3`).
   - Unordered root sets (`x = 2, x = -2`, `{-2, 2}`, `\pm 2`).
   - Linear systems (`x = 6, y = 4` vs `y = 4, x = 6`).
   - Synonym mapping for "no solution", "no real roots", "undefined".
   - Fractions and decimals (`1/2` == `0.5`).
   - Inequalities (`x > 5`, `x >= -3`).

---

## 2. Accuracy Breakdown by Category

| Category | Text Accuracy | Handwritten Accuracy | Total Accuracy |
| :--- | :---: | :---: | :---: |
| **Extraneous Roots from Cancelling** | 5 / 5 (100.0%) | 2 / 3 (66.7%) | 7 / 8 (87.5%) |
| **Domain Exclusions** | 5 / 5 (100.0%) | 2 / 2 (100.0%) | 7 / 7 (100.0%) |
| **Quadratics (Two Roots / No Real Roots)** | 3 / 5 (60.0%) | 2 / 3 (66.7%) | 5 / 8 (62.5%) |
| **Sign Errors & Negative Numbers** | 5 / 5 (100.0%) | 1 / 1 (100.0%) | 6 / 6 (100.0%) |
| **Fractions and Decimals** | 5 / 5 (100.0%) | 1 / 1 (100.0%) | 6 / 6 (100.0%) |
| **Absolute Value** | 5 / 5 (100.0%) | 2 / 2 (100.0%) | 7 / 7 (100.0%) |
| **Linear Systems** | 4 / 5 (80.0%) | 0 / 1 (0.0%) | 4 / 6 (66.7%) |
| **Simple Derivatives and Integrals** | 4 / 5 (80.0%) | 1 / 1 (100.0%) | 5 / 6 (83.3%) |
| **Inequalities** | 5 / 5 (100.0%) | 1 / 1 (100.0%) | 6 / 6 (100.0%) |
| **Word Problems** | 4 / 4 (100.0%) | N/A | 4 / 4 (100.0%) |

---

## 3. Overall Summary Statistics

- **Total Test Problem Pool**: 49 cases across 10 categories
- **Text-Level Accuracy**: **45 / 49 (91.8%)**
- **Handwritten Image Accuracy**: **12 / 15 (80.0%)**
- **Combined Overall Accuracy**: **57 / 64 (89.1%)**
- **Total Failures**: 7 (4 text, 3 handwritten)

---

## 4. Failure Analysis & Findings

The baseline revealed specific failure modes that directly inform the Task 72 SymPy symbolic checker:

### 1. Complex Roots instead of "No Real Solution"
- **Case `cat3_03`** (Text & Handwritten): $x^2 + 9 = 0$
  - *Expected*: `no real solution`
  - *Got*: `x = 3i, x = -3i`
- **Case `cat3_05`** (Text): $x^2 + 2x + 5 = 0$
  - *Expected*: `no real solution`
  - *Got*: `x = -1 + 2i, x = -1 - 2i`
- *Cause*: Without an explicit domain flag, the LLM solves over the complex field $\mathbb{C}$. SymPy's real-domain solver (`sympy.solveset(eq, x, domain=sympy.S.Reals)`) will deterministically return `EmptySet` (`no real solution`).

### 2. Incomplete Linear System Output
- **Case `cat7_03`** (Text): $3x + 2y = 12,\; y = 3$
  - *Expected*: `x = 2, y = 3`
  - *Got*: `x = 2` (omitted $y$)
- **Case `cat7_01`** (Handwritten): $x + y = 10,\; x - y = 2$
  - *Expected*: `x = 6, y = 4`
  - *Got*: `6` (omitted $y = 4$)
- *Cause*: LLM truncated the system to a single variable solution. SymPy's `linsolve` will return complete variable tuples deterministically.

### 3. Expression Simplification vs Solving
- **Case `cat1_04`** (Handwritten): $(x^2 - 5x + 6)/(x - 2) = 0$
  - *Expected*: `3`
  - *Got*: `x - 3`
- *Cause*: Fast vision model treated the equation as a simplification prompt ($x - 3$) rather than solving for the root $x = 3$.

### 4. Integration Constant Notation
- **Case `cat8_04`** (Text): $\int 2x\,dx$
  - *Expected*: `x^2`
  - *Got*: `x^2 + C`
- *Cause*: LLM included the arbitrary constant $+ C$.

---

## 5. Verification Command

To run the complete evaluation suite at any time:
```bash
cd maths-note-be
source venv/bin/activate
python evals/run_eval.py --mode all
```
Or for individual suites:
```bash
python evals/run_eval.py --mode text
python evals/run_eval.py --mode handwritten
```
To run normalization unit tests:
```bash
python -m pytest evals/test_normalize.py
```
