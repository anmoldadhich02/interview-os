"""
Memory Agent.

Single responsibility: maintain the session's rolling memory object
(strong topics, weak topics, concepts discussed, mistakes) as questions
are answered, so future questions and follow-ups can reference it.
Pure Python -- deterministic bookkeeping over evaluation output.
"""


def update_memory(memory: dict, topic: str, evaluation: dict) -> dict:
    memory = dict(memory) if memory else {
        "strong_topics": [],
        "weak_topics": [],
        "concepts_discussed": [],
        "mistakes": [],
    }
    memory.setdefault("strong_topics", [])
    memory.setdefault("weak_topics", [])
    memory.setdefault("concepts_discussed", [])
    memory.setdefault("mistakes", [])

    if topic and topic not in memory["concepts_discussed"]:
        memory["concepts_discussed"].append(topic)

    score = evaluation.get("overall_score", 0)
    if score >= 75:
        if topic not in memory["strong_topics"]:
            memory["strong_topics"].append(topic)
        if topic in memory["weak_topics"]:
            memory["weak_topics"].remove(topic)
    elif score < 50:
        if topic not in memory["weak_topics"]:
            memory["weak_topics"].append(topic)
        if topic in memory["strong_topics"]:
            memory["strong_topics"].remove(topic)
        feedback = evaluation.get("feedback")
        if feedback:
            memory["mistakes"].append({"topic": topic, "note": feedback})

    return memory
