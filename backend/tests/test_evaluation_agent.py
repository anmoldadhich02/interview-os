"""
Six test cases for the updated evaluation pipeline.
Run with: PYTHONPATH=. python tests/test_evaluation_agent.py
"""
import sys
import os

# Ensure we pick up the venv's packages when run directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.agents.evaluation_agent import (
    evaluate_answer,
    apply_relevance_cap,
    _is_empty_or_skip,
)

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

results = []


def check(label: str, condition: bool, detail: str = "") -> None:
    tag = PASS if condition else FAIL
    print(f"  [{tag}] {label}" + (f" — {detail}" if detail else ""))
    results.append(condition)


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests (no LLM call)
# ─────────────────────────────────────────────────────────────────────────────

print("\n=== Unit: apply_relevance_cap ===")
check("IRRELEVANT capped at 20",         apply_relevance_cap(81, "IRRELEVANT") == 20,    f"got {apply_relevance_cap(81, 'IRRELEVANT')}")
check("TANGENTIALLY capped at 40",       apply_relevance_cap(70, "TANGENTIALLY_RELEVANT") == 40)
check("PARTIALLY capped at 65",          apply_relevance_cap(90, "PARTIALLY_RELEVANT") == 65)
check("DIRECTLY_RELEVANT uncapped",      apply_relevance_cap(85, "DIRECTLY_RELEVANT") == 85)
check("EMPTY forced to 0",               apply_relevance_cap(50, "EMPTY") == 0)
check("SKIPPED forced to 0",             apply_relevance_cap(50, "SKIPPED") == 0)
check("score never exceeds 100",         apply_relevance_cap(150, "DIRECTLY_RELEVANT") == 100)
check("score never below 0",             apply_relevance_cap(-5, "DIRECTLY_RELEVANT") == 0)
check("unknown classification caps at 20", apply_relevance_cap(80, "UNKNOWN") == 20)

print("\n=== Unit: _is_empty_or_skip ===")
check("empty string is skip",            _is_empty_or_skip(""))
check("whitespace only is skip",         _is_empty_or_skip("   "))
check("'skip' phrase is skip",           _is_empty_or_skip("skip"))
check("'idk' phrase is skip",            _is_empty_or_skip("idk"))
check("too-short answer is skip",        _is_empty_or_skip("hi"))
check("valid long answer is not skip",   not _is_empty_or_skip("This is a detailed and valid answer to the question."))

# ─────────────────────────────────────────────────────────────────────────────
# LLM integration tests
# ─────────────────────────────────────────────────────────────────────────────

print("\n=== LLM: Test 1 — Correct answer (expect DIRECTLY_RELEVANT or PARTIALLY_RELEVANT, score >= 50) ===")
r1 = evaluate_answer(
    question="What is dependency injection in FastAPI?",
    answer=(
        "Dependency injection (DI) in FastAPI is a mechanism where the framework "
        "automatically resolves and injects declared dependencies into route handlers "
        "at request time, using the Depends() function. "
        "For example, you declare a get_db() function that yields a SQLAlchemy session "
        "and annotate the parameter with Depends(get_db) — FastAPI creates the session, "
        "passes it to the handler, and closes it after the response. "
        "DI is also how FastAPI handles authentication: a get_current_user dependency "
        "decodes the JWT token and returns the user object, so every protected route "
        "simply declares current_user: User = Depends(get_current_user). "
        "This design promotes code reuse, testability (swap real DBs for mocks in tests), "
        "and separation of concerns without any manual wiring."
    ),
    stage="technical",
    difficulty="medium",
)
print(f"  classification={r1['relevance_classification']}  relevance={r1['relevance_score']}  "
      f"raw={r1['raw_llm_score']}  final={r1['overall_score']}")
# Accept both DIRECTLY_RELEVANT and PARTIALLY_RELEVANT — both mean on-topic.
# The critical invariant is that *off-topic* answers are capped at ≤ 20.
check("T1 classified on-topic (DIRECTLY or PARTIALLY)",
      r1["relevance_classification"] in ("DIRECTLY_RELEVANT", "PARTIALLY_RELEVANT"),
      r1["relevance_classification"])
check("T1 score >= 50",                  r1["overall_score"] >= 50, str(r1["overall_score"]))
check("T1 answers_current_question=True", r1["answers_current_question"] is True)


print("\n=== LLM: Test 2 — Answer to a different question (expect IRRELEVANT, score ≤ 20) ===")
r2 = evaluate_answer(
    question="What is dependency injection in FastAPI?",
    answer="I used React and Tailwind CSS to build a responsive frontend dashboard with mobile-first design.",
    stage="technical",
    difficulty="medium",
)
print(f"  classification={r2['relevance_classification']}  relevance={r2['relevance_score']}  "
      f"raw={r2['raw_llm_score']}  final={r2['overall_score']}")
check("T2 classified IRRELEVANT",        r2["relevance_classification"] == "IRRELEVANT",
      r2["relevance_classification"])
check("T2 score ≤ 20",                   r2["overall_score"] <= 20, str(r2["overall_score"]))
check("T2 answers_current_question=False", r2["answers_current_question"] is False)

print("\n=== LLM: Test 3 — Previous-question answer (expect IRRELEVANT, score ≤ 20) ===")
r3 = evaluate_answer(
    question="How did you prevent race conditions in your orchestration layer?",
    answer=(
        "I built a responsive React dashboard using Tailwind CSS and Framer Motion. "
        "The frontend has smooth animations, dark mode support, and mobile-first layouts. "
        "I used React Query for data fetching and state management on the client side."
    ),
    stage="technical",
    difficulty="hard",
)
print(f"  classification={r3['relevance_classification']}  relevance={r3['relevance_score']}  "
      f"raw={r3['raw_llm_score']}  final={r3['overall_score']}")
check("T3 classified IRRELEVANT",        r3["relevance_classification"] == "IRRELEVANT",
      r3["relevance_classification"])
check("T3 score ≤ 20",                   r3["overall_score"] <= 20, str(r3["overall_score"]))

print("\n=== LLM: Test 4 — Same domain but incomplete (expect TANGENTIALLY or PARTIALLY, score ≤ 65) ===")
r4 = evaluate_answer(
    question="How did you manage state and prevent race conditions in your orchestration layer?",
    answer="I used LangGraph to manage the workflow.",
    stage="technical",
    difficulty="hard",
)
print(f"  classification={r4['relevance_classification']}  relevance={r4['relevance_score']}  "
      f"raw={r4['raw_llm_score']}  final={r4['overall_score']}")
check("T4 NOT DIRECTLY_RELEVANT",        r4["relevance_classification"] != "DIRECTLY_RELEVANT",
      r4["relevance_classification"])
check("T4 score ≤ 65",                   r4["overall_score"] <= 65, str(r4["overall_score"]))

print("\n=== LLM: Test 5 — Empty answer (expect score = 0) ===")
r5 = evaluate_answer(
    question="What is dependency injection in FastAPI?",
    answer="",
    stage="technical",
    difficulty="medium",
)
print(f"  classification={r5['relevance_classification']}  final={r5['overall_score']}")
check("T5 score exactly 0",              r5["overall_score"] == 0, str(r5["overall_score"]))
check("T5 classified EMPTY",            r5["relevance_classification"] in ("EMPTY", "SKIPPED"),
      r5["relevance_classification"])

print("\n=== LLM: Test 6 — 'I don't know' (expect score 0-10) ===")
r6 = evaluate_answer(
    question="What is dependency injection in FastAPI?",
    answer="I don't know",
    stage="technical",
    difficulty="medium",
)
print(f"  classification={r6['relevance_classification']}  final={r6['overall_score']}")
check("T6 score 0-10",                   r6["overall_score"] <= 10, str(r6["overall_score"]))

# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Critical guard: IRRELEVANT can never score above 20 ===")
for score_in in [81, 95, 100, 50, 30]:
    result = apply_relevance_cap(score_in, "IRRELEVANT")
    check(f"  cap({score_in}, IRRELEVANT) = {result} ≤ 20", result <= 20)

# ─────────────────────────────────────────────────────────────────────────────
total = len(results)
passed = sum(results)
failed = total - passed
print(f"\n{'='*50}")
print(f"Results: {passed}/{total} passed" + (f"  ({failed} FAILED)" if failed else "  — all OK"))
if failed:
    sys.exit(1)
