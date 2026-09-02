"""
Interview Planner Agent — Company-Aware, Fully Dynamic Version.

Single responsibility: given the candidate profile, target company/role,
and the company intelligence report, produce a dynamic, company-tailored
interview plan (ordered list of stages).

The plan ALWAYS guarantees exactly 2 coding rounds:
  - 1st coding round: medium difficulty
  - 2nd coding round: hard difficulty

Stages are ordered based on company interview structure from research intel.
"""
from __future__ import annotations

import logging

from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

_PLAN_PROMPT = """\
You are the Interview Planner Agent for an AI mock interview platform.

Given the candidate profile, target company, role, and company research intel,
produce a dynamic, company-tailored interview stage sequence.

STRICT RULES:
1. Always include EXACTLY 2 "coding_round" entries — one medium, one hard.
   - The first "coding_round" appears earlier in the sequence (medium difficulty).
   - The second "coding_round" appears later (hard difficulty).
2. Always include a dedicated rapid-fire MCQ round consisting of EXACTLY 20 consecutive "mcq" stages (10 minutes total).
3. The plan must have between 30-38 total stages.
4. FAANG/MAANG companies: must include "behavioral" and "system_design" stages.
5. Use the company's actual interview structure from the intel report.
6. Valid stage names: "resume_discussion", "cs_fundamentals", "technical",
   "coding_round", "behavioral", "system_design", "project_deep_dive",
   "mcq", "wrap_up"

Respond with ONLY valid JSON:
{
  "stages": ["stage_name", ...],
  "coding_difficulties": ["medium", "hard"],
  "focus_areas": ["string", ...],
  "rationale": "one sentence explaining the structure"
}
"""


def build_plan(
    profile: dict,
    target_company: str,
    target_role: str,
    company_intel: dict | None = None,
) -> dict:
    """
    Build a company-tailored interview plan using LLM + company intel.
    Always guarantees exactly 2 coding rounds (medium first, hard second) and 20 MCQs.
    Falls back to a sensible default if LLM fails.
    """
    client = get_llm_client()
    intel = company_intel or {}

    focus_areas = intel.get("focus_areas", [])
    interview_structure = intel.get("interview_structure", [])
    rounds = intel.get("rounds", [])
    tech_emphasis = intel.get("technical_emphasis", [])
    is_faang = any(
        name in target_company.lower()
        for name in ["google", "meta", "amazon", "apple", "netflix", "microsoft",
                     "stripe", "airbnb", "uber", "anthropic", "openai", "deepmind"]
    )

    user_prompt = (
        f"Company: {target_company}\n"
        f"Role: {target_role}\n"
        f"Is FAANG/Top Tier: {is_faang}\n"
        f"Company known interview structure: {interview_structure}\n"
        f"Interview rounds reported: {rounds}\n"
        f"Technical emphasis: {tech_emphasis}\n"
        f"Focus areas: {focus_areas}\n"
        f"Candidate profile skills: {list((profile or {}).get('skills', []))[:10]}\n\n"
        "Build a company-specific interview plan. Remember: EXACTLY 2 coding_round entries — "
        "first one is medium difficulty, second is hard; and EXACTLY 20 consecutive 'mcq' stages "
        "for the 10-minute rapid-fire round."
    )

    try:
        result = client.complete_json(_PLAN_PROMPT, user_prompt)
        stages = result.get("stages", [])

        # Validate: must have exactly 2 coding rounds
        coding_count = stages.count("coding_round")
        if coding_count != 2:
            logger.warning(
                "Planner returned %d coding rounds (expected 2) — falling back to default",
                coding_count,
            )
            stages = _default_stages(is_faang)

        # Validate: reasonable length
        if len(stages) < 15 or len(stages) > 45:
            logger.warning("Planner returned %d stages — falling back to default", len(stages))
            stages = _default_stages(is_faang)

        logger.info(
            "Planner built %d-stage plan for %s/%s: %s",
            len(stages), target_company, target_role, stages
        )

        return {
            "stages": stages,
            "coding_difficulties": ["medium", "hard"],
            "focus_areas": focus_areas,
            "rationale": result.get("rationale", f"Dynamic plan for {target_company} {target_role}."),
        }

    except Exception as exc:
        logger.error("Planner LLM call failed: %s — using default plan", exc)
        stages = _default_stages(is_faang)
        return {
            "stages": stages,
            "coding_difficulties": ["medium", "hard"],
            "focus_areas": focus_areas,
            "rationale": f"Default plan for {target_company} {target_role}.",
        }


def _default_stages(is_faang: bool) -> list[str]:
    """Return a sensible default stage sequence with exactly 2 coding rounds and 20 MCQs."""
    if is_faang:
        return (
            ["resume_discussion"] * 3
            + ["cs_fundamentals"] * 2
            + ["coding_round"]           # medium
            + ["technical"] * 2
            + ["behavioral"] * 2
            + ["coding_round"]           # hard
            + ["system_design"] * 2
            + ["project_deep_dive"] * 1
            + ["mcq"] * 20               # 20 MCQ rapid round (10 mins)
            + ["wrap_up"] * 1
        )
    else:
        return (
            ["resume_discussion"] * 3
            + ["cs_fundamentals"] * 2
            + ["coding_round"]           # medium
            + ["technical"] * 3
            + ["behavioral"] * 2
            + ["coding_round"]           # hard
            + ["project_deep_dive"] * 1
            + ["mcq"] * 20               # 20 MCQ rapid round (10 mins)
            + ["wrap_up"] * 1
        )
