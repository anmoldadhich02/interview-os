"""
Evaluation Agent.

Single responsibility: score a single answer across multiple dimensions
and explain the score. Does not decide difficulty adjustment -- that's the
Difficulty Agent's job, consuming this output.

Evaluation pipeline (executed in order):

  Current Question
       ↓
  Extract Question Requirements     (Step 1 – LLM call)
       ↓
  Validate Answer Relevance         (Step 2 – LLM call)
       ↓
  Evaluate Technical Quality        (Step 3 – LLM call)
       ↓
  Apply Relevance-Based Score Cap   (Step 4 – deterministic Python)
       ↓
  Return Final Score

Step 4 is always enforced in Python after the LLM returns its score so
a malformed or overly generous LLM response can never bypass the cap.
"""
from __future__ import annotations

import logging

from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MIN_ANSWER_LENGTH = 15  # characters – anything shorter is treated as empty

_SKIP_PHRASES = frozenset({
    "skip", "pass", "next", "idk", "i don't know", "i dont know",
    "no idea", "n/a", "na", "no answer", "none", "nothing", ".",
    "?", "-", "not sure", "unsure", "blank",
})

# Mandatory score caps keyed by relevance classification.
# These are enforced in Python after every LLM evaluation so that no prompt
# wording change can ever allow an irrelevant answer to display a high score.
_RELEVANCE_CAPS: dict[str, int] = {
    "DIRECTLY_RELEVANT":    100,
    "PARTIALLY_RELEVANT":    65,
    "TANGENTIALLY_RELEVANT": 40,
    "IRRELEVANT":            20,
    "EMPTY":                  0,
    "SKIPPED":                0,
}

# ---------------------------------------------------------------------------
# Step 1 – Extract question requirements
# ---------------------------------------------------------------------------

_QUESTION_ANALYSIS_PROMPT = """\
You are a technical interview question analyst.
Given an interview question, extract its structured requirements.

Respond with ONLY a JSON object:
{
  "primary_topic": "string",
  "required_concepts": ["string", ...],
  "requested_action": "string",
  "expected_answer_type": "string",
  "required_evidence": ["string", ...]
}"""


def _extract_question_requirements(question: str) -> dict:
    client = get_llm_client()
    return client.complete_json(
        _QUESTION_ANALYSIS_PROMPT,
        f"Interview question:\n{question}",
    )


# ---------------------------------------------------------------------------
# Step 2 – Validate answer relevance
# ---------------------------------------------------------------------------

_RELEVANCE_PROMPT = """\
You are a strict answer-relevance classifier for technical interviews.

The CURRENT QUESTION is the ONLY primary evaluation target.
Do NOT use previous answers, interview topics, or the candidate's resume to
infer relevance. Relevance means: does this answer address the current question?

Classify the answer as exactly one of:
  DIRECTLY_RELEVANT     – The answer addresses the primary topic and the requested action.
  PARTIALLY_RELEVANT    – The answer covers part of the question but misses a key requirement.
  TANGENTIALLY_RELEVANT – The answer is in the same general domain but does not answer the question.
  IRRELEVANT            – The answer addresses a different topic, project, question, or technology.
  EMPTY                 – No meaningful content.
  SKIPPED               – The candidate explicitly skips.

IMPORTANT RULES:
- A technically correct, well-written answer to a DIFFERENT question is IRRELEVANT.
- Shared technology stack does NOT imply relevance. Judge semantic overlap with the question.
- Long or grammatically polished answers are NOT inherently relevant.
- Resume achievements do NOT prove relevance to the current question.

relevance_score ranges (0–100):
  DIRECTLY_RELEVANT:     75–100
  PARTIALLY_RELEVANT:    45–74
  TANGENTIALLY_RELEVANT: 20–44
  IRRELEVANT:             0–19
  EMPTY / SKIPPED:        0

Respond with ONLY a JSON object:
{
  "classification": "DIRECTLY_RELEVANT|PARTIALLY_RELEVANT|TANGENTIALLY_RELEVANT|IRRELEVANT|EMPTY|SKIPPED",
  "relevance_score": 0-100,
  "answers_current_question": true|false,
  "reason": "string – one concise sentence explaining the classification"
}"""


def _validate_relevance(question: str, requirements: dict, answer: str) -> dict:
    client = get_llm_client()
    user_prompt = (
        f"CURRENT QUESTION:\n{question}\n\n"
        f"QUESTION REQUIREMENTS:\n{requirements}\n\n"
        f"CANDIDATE'S ANSWER:\n{answer}"
    )
    return client.complete_json(_RELEVANCE_PROMPT, user_prompt)


# ---------------------------------------------------------------------------
# Step 3 – Evaluate technical quality
# ---------------------------------------------------------------------------

_SCORING_PROMPT = """\
You are the Technical Quality Evaluator for interview answers.

The CURRENT QUESTION is the ONLY primary evaluation target.
The relevance of the answer has already been classified separately.
Your job is to score the TECHNICAL QUALITY of what was written,
but only within the bounds of what is relevant to the current question.

MANDATORY RULES:
- Do NOT give high scores because the answer is long, grammatically correct,
  technically impressive, or well structured.
- Do NOT infer that the answer is relevant from the candidate's resume, shared
  technologies, or previous questions. Relevance has already been determined.
- A technically strong answer to a DIFFERENT question is still a low-quality
  answer to the CURRENT question.
- A vague, evasive, or one-sentence response MUST score 0–20.
- Only award scores above 65 for answers that are substantive, accurate,
  and directly address the current question.

Dimensions (each 0–100):
  technical_accuracy – Is the content correct relative to the current question?
  completeness       – Does it address all required aspects of the current question?
  confidence         – Does the phrasing suggest solid understanding vs. guessing?
  communication      – Is it clearly structured and articulate?
  depth              – Does it go beyond the surface for this specific question?

Respond with ONLY a JSON object:
{
  "technical_accuracy": 0-100,
  "completeness": 0-100,
  "confidence": 0-100,
  "communication": 0-100,
  "depth": 0-100,
  "raw_llm_score": 0-100,
  "strengths": ["string", ...],
  "missing_requirements": ["string", ...],
  "feedback": "string – 2-3 sentences of specific, actionable feedback about this specific question"
}"""


def _score_technical_quality(
    question: str,
    answer: str,
    stage: str,
    difficulty: str,
    requirements: dict,
    classification: str,
) -> dict:
    client = get_llm_client()
    user_prompt = (
        f"Stage: {stage}\nDifficulty: {difficulty}\n\n"
        f"CURRENT QUESTION:\n{question}\n\n"
        f"QUESTION REQUIREMENTS:\n{requirements}\n\n"
        f"RELEVANCE CLASSIFICATION (already determined): {classification}\n\n"
        f"CANDIDATE'S ANSWER:\n{answer}"
    )
    return client.complete_json(_SCORING_PROMPT, user_prompt)


# ---------------------------------------------------------------------------
# Step 4 – Deterministic score cap
# ---------------------------------------------------------------------------

def apply_relevance_cap(llm_score: int | float, classification: str) -> int:
    """
    Clamp the LLM's raw score to the classification-specific maximum.

    This is enforced in Python, not by prompt wording, so it cannot be
    bypassed by a lenient LLM response.
    """
    cap = _RELEVANCE_CAPS.get(classification.upper(), 20)
    score = max(0, min(100, int(llm_score)))
    return min(score, cap)


# ---------------------------------------------------------------------------
# Pre-evaluation guards (no LLM call needed)
# ---------------------------------------------------------------------------

def _is_empty_or_skip(answer: str) -> bool:
    """Return True if the answer is too short or is a known skip phrase."""
    stripped = answer.strip()
    if len(stripped) < _MIN_ANSWER_LENGTH:
        return True
    if stripped.lower() in _SKIP_PHRASES:
        return True
    return False


def _classification_for_empty(answer: str) -> str:
    stripped = answer.strip()
    if not stripped:
        return "EMPTY"
    if stripped.lower() in _SKIP_PHRASES:
        return "SKIPPED"
    return "EMPTY"  # too short → treat as EMPTY


def _zero_score_evaluation(answer: str) -> dict:
    """Return a full zero-score evaluation dict without calling the LLM."""
    classification = _classification_for_empty(answer)
    if not answer.strip():
        feedback = (
            "No answer was provided. You must attempt an answer before submitting. "
            "Skipping questions results in a score of zero."
        )
    else:
        feedback = (
            f"The response '{answer.strip()[:80]}' is too brief to evaluate. "
            "Please provide a complete, thoughtful answer. "
            "Minimal or evasive responses receive a score of zero."
        )
    return {
        "technical_accuracy": 0,
        "completeness": 0,
        "confidence": 0,
        "communication": 0,
        "depth": 0,
        "raw_llm_score": 0,
        "overall_score": 0,
        "relevance_classification": classification,
        "relevance_score": 0,
        "answers_current_question": False,
        "score_cap": 0,
        "reason_for_score_cap": f"Answer is {classification.lower()}.",
        "strengths": [],
        "missing_requirements": ["A substantive answer addressing the question."],
        "feedback": feedback,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_answer(question: str, answer: str, stage: str, difficulty: str) -> dict:
    """
    Full evaluation pipeline.  Returns a dict containing:

      overall_score            – adjusted score after relevance cap (show this)
      raw_llm_score            – score before cap (backend debug only)
      relevance_classification – DIRECTLY_RELEVANT | … | IRRELEVANT | EMPTY | SKIPPED
      relevance_score          – 0-100
      answers_current_question – bool
      score_cap                – the cap that was applied
      reason_for_score_cap     – human-readable explanation
      technical_accuracy       – 0-100
      completeness             – 0-100
      confidence               – 0-100
      communication            – 0-100
      depth                    – 0-100
      strengths                – list[str]
      missing_requirements     – list[str]
      feedback                 – str
    """
    # ── Pre-flight guard ──────────────────────────────────────────────────
    if _is_empty_or_skip(answer):
        return _zero_score_evaluation(answer)

    # ── Step 1: Extract question requirements ─────────────────────────────
    try:
        requirements = _extract_question_requirements(question)
    except Exception:  # noqa: BLE001
        requirements = {}

    # ── Step 2: Validate relevance ────────────────────────────────────────
    try:
        relevance = _validate_relevance(question, requirements, answer)
    except Exception:  # noqa: BLE001
        relevance = {
            "classification": "IRRELEVANT",
            "relevance_score": 10,
            "answers_current_question": False,
            "reason": "Relevance check failed; defaulting to IRRELEVANT.",
        }

    classification: str = str(relevance.get("classification", "IRRELEVANT")).upper()
    relevance_score: int = max(0, min(100, int(relevance.get("relevance_score", 0))))
    answers_current: bool = bool(relevance.get("answers_current_question", False))

    # ── Step 3: Score technical quality ───────────────────────────────────
    try:
        quality = _score_technical_quality(
            question=question,
            answer=answer,
            stage=stage,
            difficulty=difficulty,
            requirements=requirements,
            classification=classification,
        )
    except Exception:  # noqa: BLE001
        quality = {
            "technical_accuracy": 0,
            "completeness": 0,
            "confidence": 0,
            "communication": 0,
            "depth": 0,
            "raw_llm_score": 0,
            "strengths": [],
            "missing_requirements": [],
            "feedback": "Evaluation failed. Please try again.",
        }

    raw_llm_score: int = max(0, min(100, int(quality.get("raw_llm_score", 0))))

    # ── Step 4: Apply deterministic relevance cap ─────────────────────────
    cap: int = _RELEVANCE_CAPS.get(classification, 20)
    overall_score: int = apply_relevance_cap(raw_llm_score, classification)

    if overall_score < raw_llm_score:
        reason_for_cap = (
            f"Answer classified as {classification} (cap: {cap}/100). "
            f"{relevance.get('reason', '')}"
        )
    else:
        reason_for_cap = None

    logger.debug(
        "Evaluation | question=%r | classification=%s | "
        "relevance_score=%d | raw_llm_score=%d | final=%d | cap=%d",
        question[:80],
        classification,
        relevance_score,
        raw_llm_score,
        overall_score,
        cap,
    )
    if overall_score < raw_llm_score and raw_llm_score > 0:
        scale = overall_score / raw_llm_score
        quality["technical_accuracy"] = int(quality.get("technical_accuracy", 0) * scale)
        quality["completeness"]       = int(quality.get("completeness", 0) * scale)
        quality["confidence"]         = int(quality.get("confidence", 0) * scale)
        quality["communication"]      = int(quality.get("communication", 0) * scale)
        quality["depth"]              = int(quality.get("depth", 0) * scale)

    return {
        # Primary scoring fields
        "overall_score": overall_score,
        "raw_llm_score": raw_llm_score,
        "technical_accuracy": quality.get("technical_accuracy", 0),
        "completeness": quality.get("completeness", 0),
        "confidence": quality.get("confidence", 0),
        "communication": quality.get("communication", 0),
        "depth": quality.get("depth", 0),
        # Relevance fields
        "relevance_classification": classification,
        "relevance_score": relevance_score,
        "answers_current_question": answers_current,
        "score_cap": cap,
        "reason_for_score_cap": reason_for_cap,
        # Topic
        "primary_topic": requirements.get("primary_topic"),
        # Feedback fields
        "strengths": quality.get("strengths", []),
        "missing_requirements": quality.get("missing_requirements", []),
        "feedback": quality.get("feedback", ""),
    }


# ---------------------------------------------------------------------------
# Code Evaluation (coding round)
# ---------------------------------------------------------------------------

_CODE_EVAL_PROMPT = """\
You are the Code Evaluation Agent for an AI interview platform.

Evaluate the candidate's code solution across the following dimensions.
Base your correctness assessment on the Judge0 test results provided.
Do NOT invent test outcomes.

Respond with ONLY a valid JSON object:
{
  "time_complexity": "O(?)",
  "space_complexity": "O(?)",
  "complexity_score": 0-100,
  "code_quality_score": 0-100,
  "readability_score": 0-100,
  "approach": "string — brief description of the approach used",
  "strengths": ["string", ...],
  "issues": ["string", ...],
  "optimal_approach": "string — the most efficient known approach for this problem",
  "time_complexity_explanation": "string",
  "space_complexity_explanation": "string",
  "follow_up_questions": [
    "Generate 4–5 SPECIFIC, TECHNICAL follow-up questions about THIS candidate's actual solution.
    DO NOT use generic questions like 'why did you choose this approach' or 'walk me through your code'.
    Instead, ask about:
    - The exact time and space complexity of THEIR specific implementation (e.g. 'Your solution runs in O(n log n) — can you reduce it to O(n)?')
    - Specific edge cases their code might NOT handle (e.g. 'What happens if the input contains negative numbers?')
    - How their solution would perform at extreme scale (e.g. 'If n reaches 10^8, how would you modify your approach?')
    - A concrete optimization specific to their code (e.g. 'You used a nested loop here — what data structure could eliminate the inner loop?')
    - A follow-up variant of the problem (e.g. 'Now solve it without extra space' or 'What if the array is sorted?')
    Return exactly 4 strings in this array, not this instruction block."
  ],
  "feedback": "string — 3–4 sentences of specific, actionable feedback referencing the candidate's actual code"
}

complexity_score: 100 = optimal, 70 = acceptable sub-optimal, 40 = brute force, 0 = no solution.
code_quality_score: considers naming, structure, edge-case handling, comments.
readability_score: considers formatting, variable clarity, logic flow.

CRITICAL: follow_up_questions must be SPECIFIC to the submitted code — not generic interview clichés.\
"""


def evaluate_code_solution(
    problem: dict,
    code: str,
    language: str,
    judge0_result: dict,
    approach_explanation: str = "",
) -> dict:
    """
    Evaluate a code submission for the coding round.

    Args:
        problem:              Full CodingProblem dict (from Question.coding_problem).
        code:                 Source code submitted by the candidate.
        language:             Language string (e.g. "python", "cpp").
        judge0_result:        Output of judge_service.run_test_cases().
        approach_explanation: Optional candidate's verbal explanation.

    Returns:
        CodeEvaluation dict — mirrors CodeEvaluationResponse schema.

    CRITICAL: When judge0_result["execution_error"] is True, the function returns
    a neutral result with execution_service_error=True.  It does NOT compute
    correctness_score from 0/N test results — that would wrongly penalise a
    candidate for an infrastructure failure.
    """
    # ── Guard: execution service failure ──────────────────────────────────────
    if judge0_result.get("execution_error", False):
        error_msg = judge0_result.get(
            "error_message",
            "The code execution service encountered an error and your submission could not be evaluated.",
        )
        error_code = judge0_result.get("error_code", "EXECUTION_SERVICE_ERROR")
        logger.warning(
            "Code evaluation skipped — execution_error=True (code=%s, error=%s)",
            error_code, error_msg,
        )
        return {
            "tests_passed": 0,
            "tests_total": judge0_result.get("tests_total", 0),
            "correctness_score": None,    # None = not evaluated (not 0)
            "time_complexity": "Unknown",
            "space_complexity": "Unknown",
            "complexity_score": 50,
            "code_quality_score": 50,
            "readability_score": 50,
            "overall_score": 50,          # neutral — do not penalise
            "approach": "Could not evaluate — execution service error",
            "strengths": [],
            "issues": [f"Execution service error: {error_code}"],
            "optimal_approach": "",
            "follow_up_questions": [
                "Can you walk me through your approach?",
                "What is the time and space complexity of your solution?",
            ],
            "feedback": (
                f"⚠️ Execution Service Error: {error_msg} "
                "Your code was not penalised — this is an infrastructure issue, not a code error."
            ),
            "execution_service_error": True,
            "execution_error_code": error_code,
            "should_follow_up": True,
        }

    tests_passed: int = judge0_result.get("tests_passed", 0)
    tests_total: int = judge0_result.get("tests_total", 1)
    correctness_score: int = int((tests_passed / max(tests_total, 1)) * 100)

    if _is_empty_or_skip(code.strip()):
        return {
            "tests_passed": tests_passed,
            "tests_total": tests_total,
            "correctness_score": 0,
            "time_complexity": "N/A",
            "space_complexity": "N/A",
            "complexity_score": 0,
            "code_quality_score": 0,
            "readability_score": 0,
            "overall_score": 0,
            "approach": "No code submitted",
            "strengths": [],
            "issues": ["No code was submitted."],
            "optimal_approach": "",
            "follow_up_questions": ["Can you walk me through how you would approach this problem?"],
            "feedback": "No code was submitted for evaluation.",
            "execution_service_error": False,
            "should_follow_up": True,
        }

    client = get_llm_client()
    user_prompt = (
        f"Problem title: {problem.get('title', 'Coding Challenge')}\n"
        f"Problem description: {str(problem.get('description', ''))[:600]}\n\n"
        f"Language: {language}\n"
        f"Submitted code:\n```{language}\n{code[:3000]}\n```\n\n"
        f"Test results: {tests_passed}/{tests_total} cases passed\n"
        f"Failure details: {str(judge0_result.get('results', []))[:600]}\n"
        f"Candidate's explanation: {approach_explanation or '(not provided)'}\n\n"
        "Evaluate the solution."
    )

    try:
        result = client.complete_json(_CODE_EVAL_PROMPT, user_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.error("Code evaluation LLM call failed: %s", exc)
        result = {
            "time_complexity": "Unknown",
            "space_complexity": "Unknown",
            "complexity_score": 50,
            "code_quality_score": 50,
            "readability_score": 50,
            "approach": "Could not analyse",
            "strengths": [],
            "issues": [],
            "optimal_approach": "",
            "follow_up_questions": [
                "Can you walk me through your approach?",
                "What is the time complexity of your solution?",
            ],
            "feedback": "Code executed. Manual review recommended.",
        }

    # Compute overall weighted score
    overall = int(
        correctness_score * 0.50
        + int(result.get("complexity_score", 50)) * 0.20
        + int(result.get("code_quality_score", 50)) * 0.15
        + int(result.get("readability_score", 50)) * 0.15
    )

    return {
        "tests_passed": tests_passed,
        "tests_total": tests_total,
        "correctness_score": correctness_score,
        "time_complexity": result.get("time_complexity", "Unknown"),
        "space_complexity": result.get("space_complexity", "Unknown"),
        "complexity_score": int(result.get("complexity_score", 50)),
        "code_quality_score": int(result.get("code_quality_score", 50)),
        "readability_score": int(result.get("readability_score", 50)),
        "overall_score": overall,
        "approach": result.get("approach", ""),
        "strengths": result.get("strengths", []),
        "issues": result.get("issues", []),
        "optimal_approach": result.get("optimal_approach", ""),
        "follow_up_questions": result.get("follow_up_questions", []),
        "feedback": result.get("feedback", ""),
        "execution_service_error": False,
        "should_follow_up": True,   # coding round always gets voice follow-ups
    }
