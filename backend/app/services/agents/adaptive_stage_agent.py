"""
Adaptive Stage Agent.

Single responsibility: given the current interview state (stage, answered
question counts, performance scores, plan, company intel), decide the next
high-level action for the orchestrator:

  "continue"     – generate another question in the current stage
  "next_stage"   – advance to the next planned stage
  "coding_round" – switch directly to the embedded coding assessment
  "complete"     – end the interview

Uses LLM reasoning for natural, adaptive flow. Falls back to deterministic
plan-walking if the LLM call fails.
"""
from __future__ import annotations

import logging

from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

_PROMPT = """\
You are the Adaptive Stage Agent for an AI mock interview platform.

Your job: decide the next action for the interviewer after a question has been answered.

VALID ACTIONS:
  "continue"     — ask another question in the current stage
  "next_stage"   — move to the next stage in the plan
  "coding_round" — jump directly to the embedded coding assessment
  "complete"     — end the interview now

STRICT RULES:
- coding_round action is only valid if coding_rounds_completed < 2 AND the next item in the plan is "coding_round".
- Do NOT trigger coding_round if coding_rounds_completed >= 2.
- "complete" only when wrap_up has ≥ 1 answered question OR total_answered ≥ max_questions.
- Prefer 1–3 questions per non-coding stage before advancing.
- Once the candidate shows a clear weakness, stay in the current stage for 1 more question.
- Once the candidate shows consistent strength, advance sooner.
- behavioral stage is mandatory for FAANG/MAANG; do NOT skip it.
- Follow the plan's stage order — use next_stage_from_plan as the next_stage value when advancing.

Respond with ONLY valid JSON:
{
  "action": "continue | next_stage | coding_round | complete",
  "next_stage": "stage_identifier or null",
  "rationale": "one brief sentence"
}\
"""


def decide_next_action(
    current_stage: str,
    plan: dict,
    memory: dict,
    total_answered: int,
    stage_answered: int,
    last_score: int,
    coding_rounds_completed: int,
    company_intel: dict,
    max_questions: int,
) -> dict:
    """
    Return the next action dict: { action, next_stage, rationale }.
    Uses LLM reasoning for adaptive decisions; falls back to deterministic plan-walking.
    """
    plan_stages: list[str] = plan.get("stages", _default_stages())

    # Hard guard: never exceed max questions
    if total_answered >= max_questions:
        return {"action": "complete", "next_stage": None, "rationale": "Reached maximum question count."}

    # Find what stage comes next in the plan
    next_stage_from_plan = _find_next_in_plan(plan_stages, current_stage, total_answered)

    # Hard guard: if we've exhausted the plan, complete
    if next_stage_from_plan is None and current_stage == "wrap_up":
        return {"action": "complete", "next_stage": None, "rationale": "Interview plan completed."}

    # Ensure rapid MCQ rounds bypass LLM to stay fast
    if current_stage == "mcq" and stage_answered < 20 and plan_stages.count("mcq") >= 20:
        return {"action": "continue", "next_stage": "mcq", "rationale": f"Continuing 20-question rapid MCQ round ({stage_answered}/20)."}
    elif current_stage == "mcq" and next_stage_from_plan:
        # If we hit the limit or count varies, just go to the next stage deterministically for MCQs
        return {"action": "next_stage", "next_stage": next_stage_from_plan, "rationale": "Finished MCQ round, moving to next stage deterministically."}

    client = get_llm_client()

    user_prompt = (
        f"current_stage: {current_stage}\n"
        f"stage_answered: {stage_answered}\n"
        f"total_answered: {total_answered}\n"
        f"max_questions: {max_questions}\n"
        f"last_score: {last_score}/100\n"
        f"coding_rounds_completed: {coding_rounds_completed}/2\n"
        f"next_stage_from_plan: {next_stage_from_plan}\n"
        f"candidate_memory: strong={memory.get('strong_topics', [])}, "
        f"weak={memory.get('weak_topics', [])}\n"
        f"company: {company_intel.get('company_name', 'unknown')}\n"
        "Decide the next action. If advancing, use next_stage_from_plan as the next_stage value."
    )

    try:
        result = client.complete_json(_PROMPT, user_prompt)
        action = result.get("action", "continue")
        next_stage = result.get("next_stage")
        rationale = result.get("rationale", "")

        # Safety guardrails
        if action == "coding_round" and coding_rounds_completed >= 2:
            logger.warning("LLM suggested coding_round but 2 already done — advancing to next stage instead")
            action = "next_stage"
            next_stage = next_stage_from_plan

        if action == "complete" and current_stage != "wrap_up" and total_answered < max_questions // 2:
            logger.warning("LLM suggested early complete — overriding to continue")
            action = "continue"
            next_stage = None

        # If next_stage action but no stage provided, use plan
        if action == "next_stage" and not next_stage:
            next_stage = next_stage_from_plan

        if action == "coding_round":
            next_stage = "coding_round"

        logger.info(
            "Adaptive stage: %s → %s (next_stage=%s) | %s",
            current_stage, action, next_stage, rationale,
        )
        return {"action": action, "next_stage": next_stage, "rationale": rationale}

    except Exception as exc:
        logger.warning("Adaptive stage LLM failed (%s) — using deterministic fallback", exc)
        return _deterministic_fallback(
            current_stage, plan_stages, total_answered, stage_answered,
            coding_rounds_completed, next_stage_from_plan
        )


def _deterministic_fallback(
    current_stage: str,
    plan_stages: list[str],
    total_answered: int,
    stage_answered: int,
    coding_rounds_completed: int,
    next_stage_from_plan: str | None,
) -> dict:
    """Simple fallback: follow the plan sequentially."""
    if not next_stage_from_plan:
        return {"action": "complete", "next_stage": None, "rationale": "Plan exhausted."}

    # Ensure 20 MCQs in rapid round
    if current_stage == "mcq" and stage_answered < 20 and plan_stages.count("mcq") >= 20:
        return {"action": "continue", "next_stage": "mcq", "rationale": f"Continuing rapid MCQ round ({stage_answered}/20)."}

    # Stay in current stage for at least 1-2 questions
    if stage_answered < 2 and current_stage not in ("wrap_up", "coding_round"):
        return {"action": "continue", "next_stage": current_stage, "rationale": "Continuing stage (fallback)."}

    if next_stage_from_plan == "coding_round" and coding_rounds_completed < 2:
        return {"action": "coding_round", "next_stage": "coding_round", "rationale": "Moving to coding round (fallback)."}

    if next_stage_from_plan == current_stage:
        return {"action": "continue", "next_stage": current_stage, "rationale": "Continuing same stage (fallback)."}

    return {"action": "next_stage", "next_stage": next_stage_from_plan, "rationale": "Advancing to next stage (fallback)."}


def _find_next_in_plan(stages: list[str], current: str, total_answered: int) -> str | None:
    """
    Walk the plan sequentially from the current stage rather than indexing
    by raw question count, so extra/skipped questions in one stage cannot
    desync the plan from what's actually been covered.
    """
    if current not in stages:
        # current stage isn't in the plan (e.g. coding_round injected ad hoc) —
        # fall back to positional lookup as a last resort
        return stages[total_answered] if total_answered < len(stages) else None

    # find the first occurrence of `current`, then walk forward past all
    # consecutive occurrences of the same stage to find the next distinct one
    i = stages.index(current)
    while i < len(stages) and stages[i] == current:
        i += 1
    return stages[i] if i < len(stages) else None


def _default_stages() -> list[str]:
    return (
        ["resume_discussion"] * 3
        + ["cs_fundamentals"] * 2
        + ["coding_round"]
        + ["technical"] * 3
        + ["behavioral"] * 2
        + ["coding_round"]
        + ["project_deep_dive"]
        + ["mcq"] * 5
        + ["wrap_up"]
    )
