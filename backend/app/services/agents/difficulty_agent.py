"""
Difficulty Agent.

Single responsibility: given the running score history, decide whether the
next question should go up, down, or stay at the same difficulty level.
Pure Python, no LLM call needed -- difficulty adaptation is a deterministic
policy over evaluation scores.
"""
LEVELS = ["easy", "medium", "hard", "senior", "staff"]


def next_difficulty(current: str, last_overall_score: int, prev_overall_score: int | None = None) -> str:
    idx = LEVELS.index(current) if current in LEVELS else 1

    if last_overall_score >= 85 and (prev_overall_score is None or prev_overall_score >= 70) and idx < len(LEVELS) - 1:
        idx += 1
    elif last_overall_score < 50 and (prev_overall_score is None or prev_overall_score < 60) and idx > 0:
        idx -= 1
    # 50-84: stay at current level

    return LEVELS[idx]
