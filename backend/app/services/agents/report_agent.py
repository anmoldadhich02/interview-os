"""
Report Generation Agent — Rich Version.

Single responsibility: synthesise the full interview transcript, per-question
evaluations (including relevance classifications from the updated evaluation
pipeline), resume profile, and any GitHub validation data into a comprehensive,
evidence-based hiring report.

All generated content must be grounded in actual interview data.
"""
from __future__ import annotations

import logging

from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are the InterviewOS Report Generation Agent.

Your job is to analyse a complete interview transcript and produce a rich,
evidence-based final report. Every insight you generate MUST be grounded in the
actual answers and evaluation data provided. Do not invent weaknesses or strengths.

INPUT FORMAT
============
You will receive:
  - target_company, target_role
  - resume profile (skills, projects, experience, seniority estimate)
  - github_validation (if available): credibility score, per-project status
  - transcript: a list of objects, each containing:
      question, stage, difficulty, candidate_answer,
      overall_score, raw_llm_score, relevance_classification,
      relevance_score, answers_current_question, technical_accuracy,
      completeness, confidence, communication, depth,
      strengths (list), missing_requirements (list), feedback

OUTPUT FORMAT
=============
Respond with ONLY a single valid JSON object with this exact structure.
Do NOT include markdown fences or any text outside the JSON.

{
  "overall_score": <float 0-100, mean of all overall_scores>,
  "performance_level": <"Exceptional"|"Strong"|"Good"|"Developing"|"Needs Improvement"|"Significant Improvement Needed">,
  "executive_summary": <string, 3-5 sentences based on actual patterns>,

  "readiness_score": <float 0-100, computed from consistency + relevance + depth + follow-up performance>,
  "readiness_level": <"Ready for challenging interviews"|"Interview-ready with targeted preparation"|"Needs focused preparation"|"Build fundamentals before intensive interviews">,
  "readiness_explanation": <string, 2-3 sentences explaining how the score was derived>,

  "technical_score": <float>,
  "behavioral_score": <float>,
  "communication_score": <float>,
  "hiring_recommendation": <"Strong Hire"|"Hire"|"Lean Hire"|"No Hire"|"Strong No Hire">,

  "performance_insights": {
    "overall_pattern": <string>,
    "strongest_pattern": <string>,
    "weakest_pattern": <string>,
    "follow_up_performance": <string>,
    "answer_style": <string>,
    "trend": <"improving"|"declining"|"stable"|"mixed">
  },

  "score_breakdown": [
    {
      "category": <string e.g. "Question Relevance">,
      "score": <float 0-100>,
      "max_score": 100,
      "explanation": <string, evidence-based>
    }
  ],

  "strengths": [
    {
      "strength": <string, specific name>,
      "confidence": <int 0-100>,
      "evidence": <string, what in the transcript demonstrates this>,
      "related_questions": [<string>]
    }
  ],

  "weaknesses": [
    {
      "topic": <string>,
      "severity": <"HIGH"|"MEDIUM"|"LOW">,
      "current_level": <string e.g. "Beginner"|"Intermediate">,
      "evidence": <string, what answer or pattern shows this>,
      "why_it_matters": <string>,
      "how_to_improve": <string, concrete action>
    }
  ],

  "highest_impact_improvement": {
    "focus": <string>,
    "why": <string, cross-question evidence>,
    "estimated_score_impact": <string e.g. "10-18 points (AI estimate)">,
    "next_action": <string, concrete step>
  },

  "question_analyses": [
    {
      "question_number": <int>,
      "stage": <string>,
      "question": <string>,
      "candidate_answer": <string>,
      "score": <float>,
      "relevance_classification": <string>,
      "what_you_did_well": <string>,
      "what_was_missing": <string>,
      "why_points_were_lost": <string>,
      "how_to_improve": <string>
    }
  ],

  "answer_pattern": {
    "primary_style": <string>,
    "positive_effect": <string>,
    "risk": <string>,
    "recommendation": <string>
  },

  "performance_timeline": [
    {
      "question_number": <int>,
      "question_short": <string, first 60 chars>,
      "score": <float>,
      "stage": <string>,
      "is_followup": <bool>
    }
  ],

  "seven_day_plan": [
    {
      "day": <int 1-7>,
      "topic": <string, from actual weak areas>,
      "goal": <string>,
      "practice_task": <string, concrete>,
      "expected_outcome": <string>
    }
  ],

  "readiness_radar": [
    {"axis": "Technical Knowledge", "score": <float 0-100>},
    {"axis": "Technical Depth", "score": <float 0-100>},
    {"axis": "Project Understanding", "score": <float 0-100>},
    {"axis": "Answer Relevance", "score": <float 0-100>},
    {"axis": "Problem Solving", "score": <float 0-100>},
    {"axis": "Communication", "score": <float 0-100>},
    {"axis": "Follow-Up Performance", "score": <float 0-100>}
  ],

  "github_project_insights": <null or {
    "verified_claims": [<string>],
    "partial_claims": [<string>],
    "claims_needing_explanation": [<string>],
    "likely_interview_topics": [<string>],
    "credibility_score": <int 0-100>,
    "summary": <string>
  }>,

  "summary": <string, 2-3 sentence hiring-committee summary>
}

STRICT RULES
============
1. Base all scores on the actual evaluation data provided. Do not invent them.
2. overall_score = mean of all question overall_scores from the transcript.
3. readiness_score is different from overall_score — factor in relevance ratio, follow-up performance, and consistency.
4. If fewer than 3 questions have been answered, note the limited sample.
5. seven_day_plan must use the candidate's actual weak topics, not generic ones.
6. github_project_insights is null when no GitHub data is available.
7. Do not expose internal model reasoning. Produce readable, professional feedback.
8. Produce exactly 7 days in seven_day_plan.
9. Produce 3-6 strengths and 1-5 weaknesses based on evidence.
10. All score values must be numeric (not strings).
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_report(
    transcript: list[dict],
    target_company: str,
    target_role: str,
    resume_profile: dict | None = None,
    github_validation: dict | None = None,
) -> dict:
    """
    Generate a rich, evidence-based final report from the interview transcript.

    Args:
        transcript: List of dicts, each containing question, answer, and the
                    full evaluation dict produced by the updated evaluation agent.
        target_company: Target company name.
        target_role: Target role name.
        resume_profile: Structured profile from the resume agent (optional).
        github_validation: GitHub validation report (optional).

    Returns:
        Parsed JSON dict matching the rich report structure.
    """
    client = get_llm_client()

    user_prompt = (
        f"Target company: {target_company}\n"
        f"Target role: {target_role}\n\n"
        f"Resume profile:\n{resume_profile or 'Not provided'}\n\n"
        f"GitHub validation:\n{github_validation or 'Not available'}\n\n"
        f"Full interview transcript ({len(transcript)} questions answered):\n"
        f"{transcript}"
    )

    try:
        result = client.complete_json(SYSTEM_PROMPT, user_prompt)
    except Exception as exc:
        logger.error("Report generation failed: %s", exc)
        # Return a minimal fallback so the endpoint never 500s
        result = _fallback_report(transcript, target_company, target_role)

    # Validate / coerce required scalar fields so the DB write never fails
    result.setdefault("overall_score", _mean_score(transcript))
    result.setdefault("performance_level", _perf_level(result["overall_score"]))
    result.setdefault("executive_summary", "Report generation completed.")
    result.setdefault("readiness_score", result["overall_score"])
    result.setdefault("readiness_level", "Needs focused preparation")
    result.setdefault("readiness_explanation", "")
    result.setdefault("technical_score", result["overall_score"])
    result.setdefault("behavioral_score", result["overall_score"])
    result.setdefault("communication_score", result["overall_score"])
    result.setdefault("hiring_recommendation", "Lean Hire")
    result.setdefault("summary", result.get("executive_summary", ""))
    result.setdefault("strengths", [])
    result.setdefault("weaknesses", [])
    result.setdefault("learning_plan", [])
    result.setdefault("performance_insights", {})
    result.setdefault("score_breakdown", [])
    result.setdefault("highest_impact_improvement", {})
    result.setdefault("question_analyses", [])
    result.setdefault("answer_pattern", {})
    result.setdefault("performance_timeline", [])
    result.setdefault("seven_day_plan", [])
    result.setdefault("readiness_radar", [])
    result.setdefault("github_project_insights", None)

    # Ensure numeric types for scores
    for key in ("overall_score", "readiness_score", "technical_score",
                "behavioral_score", "communication_score"):
        result[key] = float(result.get(key) or 0)

    logger.info(
        "Report generated | company=%s | role=%s | questions=%d | overall=%.1f",
        target_company, target_role, len(transcript), result["overall_score"],
    )
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mean_score(transcript: list[dict]) -> float:
    scores = [t.get("overall_score", 0) for t in transcript if t.get("overall_score") is not None]
    return round(sum(scores) / len(scores), 1) if scores else 0.0


def _perf_level(score: float) -> str:
    if score >= 90:
        return "Exceptional"
    if score >= 80:
        return "Strong"
    if score >= 70:
        return "Good"
    if score >= 60:
        return "Developing"
    if score >= 40:
        return "Needs Improvement"
    return "Significant Improvement Needed"


def _fallback_report(transcript: list[dict], company: str, role: str) -> dict:
    """Minimal valid report used when the LLM call fails."""
    score = _mean_score(transcript)
    return {
        "overall_score": score,
        "performance_level": _perf_level(score),
        "executive_summary": (
            f"Your interview for {role} at {company} has been completed and scored. "
            "Detailed AI analysis was unavailable; please try regenerating the report."
        ),
        "readiness_score": score,
        "readiness_level": "Needs focused preparation",
        "readiness_explanation": "Based on overall performance score.",
        "technical_score": score,
        "behavioral_score": score,
        "communication_score": score,
        "hiring_recommendation": "Lean Hire",
        "summary": f"Interview for {role} at {company} completed.",
        "strengths": [],
        "weaknesses": [],
        "learning_plan": [],
        "performance_insights": {},
        "score_breakdown": [],
        "highest_impact_improvement": {},
        "question_analyses": [],
        "answer_pattern": {},
        "performance_timeline": [],
        "seven_day_plan": [],
        "readiness_radar": [],
        "github_project_insights": None,
    }
