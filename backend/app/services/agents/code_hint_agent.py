"""
Code Hint Agent.

Monitors the candidate's code in real time during the coding round and
generates contextual spoken hints proactively.
"""
from __future__ import annotations

import logging

from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# ── Hint types ────────────────────────────────────────────────────────────────
HINT_TYPES = {
    "PLAN_REQUEST":      "plan",
    "BRUTE_FORCE":       "brute_force",
    "OPTIMIZATION":      "optimization",
    "EDGE_CASE_WARNING": "edge_case",
    "APPROACH_HINT":     "approach",
    "ENCOURAGEMENT":     "encouragement",
    "COMPLEXITY_PROBE":  "complexity",
    "SYNTAX_WARNING":    "syntax_warning",
    "RUBRIC_PROBE":      "rubric_probe",
}

# ── LLM prompt ────────────────────────────────────────────────────────────────
_HINT_PROMPT = """\
You are a live AI coding interview coach monitoring a candidate writing code in real-time.
You are interviewing them for the specified Company.

Your role:
- Act as a proactive pair-programmer.
- Analyze the candidate's current code snapshot. If they are stuck, ask probing questions about their approach.
- If they are writing an inefficient loop (e.g. O(n^2)), nudge them towards optimization.
- Give hints when stuck, but NEVER give away the full solution.
- Warn about edge cases or syntax issues their code misses.
- Evaluate and nudge them based on the specific Company's technical emphasis and rubrics provided.
- Keep hints SHORT — max 2 sentences, spoken naturally.

Respond with ONLY a JSON object:
{
  "hint_text": "string — natural, conversational, max 2 sentences. Leave empty if no hint is needed right now.",
  "hint_type": "PLAN_REQUEST|BRUTE_FORCE|OPTIMIZATION|EDGE_CASE_WARNING|APPROACH_HINT|ENCOURAGEMENT|COMPLEXITY_PROBE|SYNTAX_WARNING|RUBRIC_PROBE",
  "should_speak": true|false
}

should_speak=false if no hint is needed right now, or if they are actively typing and making good progress.
Otherwise always true.

IMPORTANT:
- Do NOT reveal the correct algorithm or solution.
- Do NOT say "the answer is..."
- DO mention specific edge cases the code seems to miss.
- DO mention complexity concerns if the code is clearly O(n²) or worse for large n.
- DO tailor your hints to the Company's culture/rubrics (e.g. Amazon LPs, Google algorithmic focus).
- DO keep it encouraging and conversational."""


def generate_hint(
    problem: dict,
    code: str,
    language: str,
    elapsed_seconds: int,
    hints_given: list[str],
    company_intel: dict = None,
) -> dict:
    """
    Analyse the candidate's current code and generate a contextual hint.
    """
    code_stripped = code.strip()
    is_starter_or_empty = (
        not code_stripped
        or code_stripped == (problem.get("starter_code", {}).get(language, "")).strip()
        or len(code_stripped) < 20
    )

    if company_intel is None:
        company_intel = {}
        
    company_name = company_intel.get("company_name", "the company")
    tech_focus = company_intel.get("technical_emphasis", [])
    behavioral_themes = company_intel.get("behavioral_themes", [])

    # Don't interrupt in the first 45 seconds — let them read the problem
    if elapsed_seconds < 45 and is_starter_or_empty:
        return {
            "hint_text":   "",
            "hint_type":   "PLAN_REQUEST",
            "should_speak": False,
        }

    # Build user prompt for LLM
    constraints_str = "\n".join(problem.get("constraints", []))[:400]
    user_prompt = (
        f"Company: {company_name}\n"
        f"Company Technical Focus / Rubrics: {tech_focus}\n"
        f"Company Cultural Themes: {behavioral_themes}\n\n"
        f"Problem: {problem.get('title', 'Coding Challenge')}\n"
        f"Description: {str(problem.get('description', ''))[:500]}\n"
        f"Constraints:\n{constraints_str}\n\n"
        f"Language: {language}\n"
        f"Time elapsed: {elapsed_seconds // 60} minutes {elapsed_seconds % 60} seconds\n"
        f"Hints already given this session: {hints_given}\n\n"
        f"Candidate's current code:\n```{language}\n{code_stripped[:2000]}\n```\n\n"
        f"Code status: {'empty/stub' if is_starter_or_empty else 'in progress'}\n\n"
        "Generate a real-time hint. If they are making good progress, you can set should_speak to false. "
        "If they are stuck or writing bad code, give a proactive hint (max 2 sentences, conversational)."
    )

    try:
        client = get_llm_client()
        result = client.complete_json(_HINT_PROMPT, user_prompt)

        hint_text  = result.get("hint_text", "").strip()
        hint_type  = result.get("hint_type", "APPROACH_HINT")
        should_speak = result.get("should_speak", True)

        return {
            "hint_text":    hint_text,
            "hint_type":    hint_type,
            "should_speak": should_speak and bool(hint_text),
        }

    except Exception as exc:
        logger.error("Code hint agent LLM call failed: %s", exc)
        return {
            "hint_text":    "Keep going! Let me know if you want to walk through your plan.",
            "hint_type":    "ENCOURAGEMENT",
            "should_speak": True,
        }
