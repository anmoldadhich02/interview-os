"""
Interview Orchestrator — Company-Aware + Coding Round Version.

Coordinates all agents in a deterministic state machine:

  start_session()
    ├─ company_research_service.research()   ← web search → company_intel
    ├─ planner_agent.build_plan()            ← company-aware stage plan
    └─ _generate_next_question()             ← first voice question

  submit_answer()
    ├─ evaluation_agent.evaluate_answer()
    ├─ memory_agent.update_memory()
    ├─ difficulty_agent.next_difficulty()
    ├─ followup_agent.evaluate_followup_need()
    └─ adaptive_stage_agent.decide_next_action()
         ├─ "continue"     → _generate_next_question()
         ├─ "next_stage"   → advance stage → _generate_next_question()
         ├─ "coding_round" → _generate_coding_question()
         └─ "complete"     → mark session completed

  submit_code_answer()
    ├─ judge_service.run_test_cases()
    ├─ evaluation_agent.evaluate_code_solution()
    └─ _generate_post_coding_question()       ← voice follow-ups about the code

  finalize_report()
    └─ report_agent.generate_report()
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.config import get_settings
from app.models.interview import (
    Answer,
    DifficultyLevel,
    InterviewSession,
    InterviewStage,
    Question,
    SessionStatus,
)
from app.models.report import Report
from app.models.resume import Resume
from app.services import company_research_service, judge_service
from app.services.agents import (
    adaptive_stage_agent,
    coding_question_agent,
    difficulty_agent,
    evaluation_agent,
    followup_agent,
    memory_agent,
    planner_agent,
    question_agent,
    report_agent,
)

logger = logging.getLogger(__name__)
settings = get_settings()

import concurrent.futures

# ── Background Queue for Speculative Pre-Generation ───────────────────────────
_pregen_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
_pregen_tasks: dict[uuid.UUID, dict] = {}

def _queue_pre_generation(
    session_id: uuid.UUID,
    profile: dict,
    stage: str,
    difficulty: str,
    memory: dict,
    previous_questions: list[str],
    target_company: str,
    company_intel: dict,
    all_previously_asked: list[str],
):
    future = _pregen_executor.submit(
        question_agent.generate_question,
        profile=profile,
        stage=stage,
        difficulty=difficulty,
        memory=memory,
        previous_questions=previous_questions,
        target_company=target_company,
        company_intel=company_intel,
        all_previously_asked=all_previously_asked,
    )
    _pregen_tasks[session_id] = {
        "future": future,
        "stage": stage,
        "difficulty": difficulty
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stage_str(session: InterviewSession) -> str:
    """Return current stage as a plain string."""
    return session.current_stage if isinstance(session.current_stage, str) else session.current_stage.value


def _stage_question_count(session: InterviewSession, stage: str) -> int:
    return sum(1 for q in session.questions if q.stage == stage)


def _coding_rounds_completed(session: InterviewSession) -> int:
    return sum(
        1 for q in session.questions
        if q.question_type == "coding" and q.answer is not None
    )


def _previously_asked_coding_titles(session: InterviewSession) -> list[str]:
    return [
        (q.coding_problem or {}).get("title", "")
        for q in session.questions
        if q.question_type == "coding" and q.coding_problem
    ]


# ── Cross-session deduplication ──────────────────────────────────────────────

def _fetch_all_previously_asked(db: DBSession, user_id: uuid.UUID, company: str) -> list[str]:
    """
    Return all question texts asked to this user for this company across ALL
    past sessions. Used to ensure questions are never repeated between interviews.
    """
    rows = db.execute(
        select(Question.text)
        .join(InterviewSession, InterviewSession.id == Question.session_id)
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.target_company.ilike(company),
        )
        .distinct()
    ).scalars().all()
    return list(rows)


# ── Question generation ───────────────────────────────────────────────────────

def _generate_next_question(
    db: DBSession,
    session: InterviewSession,
    resume: Resume,
) -> Question:
    """Generate a voice question for the current stage, with full cross-session deduplication."""
    previous_questions = [q.text for q in session.questions]
    all_previously_asked = _fetch_all_previously_asked(db, session.user_id, session.target_company)
    
    current_stage = _stage_str(session)
    current_difficulty = session.current_difficulty.value

    # Check for a matching pre-generated question
    result = None
    task_info = _pregen_tasks.pop(session.id, None)
    if task_info and task_info["stage"] == current_stage and task_info["difficulty"] == current_difficulty:
        logger.info("Using speculatively pre-generated question for session %s", session.id)
        try:
            result = task_info["future"].result(timeout=10.0)
        except Exception as exc:
            logger.warning("Pre-generation task failed or timed out: %s", exc)

    if not result:
        logger.info("Generating question synchronously for session %s", session.id)
        result = question_agent.generate_question(
            profile=resume.profile,
            stage=current_stage,
            difficulty=current_difficulty,
            memory=session.memory,
            previous_questions=previous_questions,
            target_company=session.target_company,
            company_intel=session.company_intel or {},
            all_previously_asked=all_previously_asked,
        )

    mcq_data = None
    if current_stage == "mcq":
        raw_options = result.get("mcq_options") or result.get("options") or result.get("choices") or []
        if isinstance(raw_options, dict):
            raw_options = [f"{k}) {v}" for k, v in raw_options.items()]
        elif isinstance(raw_options, str):
            raw_options = [opt.strip() for opt in raw_options.split("\n") if opt.strip()]
        mcq_data = {
            "options": raw_options,
            "correct_option": result.get("mcq_correct_option") or result.get("correct_option", ""),
            "explanation": result.get("mcq_explanation") or result.get("explanation", ""),
        }

    q = Question(
        session_id=session.id,
        stage=current_stage,
        difficulty=session.current_difficulty,
        text=result.get("question", "Tell me about a challenging project you've worked on."),
        is_followup=False,
        question_type="mcq" if current_stage == "mcq" else "voice",
        coding_problem=None,
        mcq_data=mcq_data,
        order_index=len(session.questions),
    )
    db.add(q)
    db.flush()
    
    # Queue the *next* speculative generation using the current context
    # We anticipate the user staying in the current stage and difficulty
    _queue_pre_generation(
        session_id=session.id,
        profile=resume.profile,
        stage=current_stage,
        difficulty=current_difficulty,
        memory=session.memory,
        previous_questions=previous_questions + [q.text],
        target_company=session.target_company,
        company_intel=session.company_intel or {},
        all_previously_asked=all_previously_asked + [q.text],
    )
    
    return q


def _generate_coding_question(db: DBSession, session: InterviewSession) -> Question:
    """Generate a coding round question with a full problem spec."""
    rounds_done = _coding_rounds_completed(session)

    # Map the 5-level interview difficulty scale down to the 3-level coding scale.
    _CODING_DIFFICULTY_MAP = {
        "easy": "easy", "medium": "medium", "hard": "hard",
        "senior": "hard", "staff": "hard",
    }
    base_difficulty = _CODING_DIFFICULTY_MAP.get(session.current_difficulty.value, "medium")

    if rounds_done == 0:
        forced_difficulty = base_difficulty
    else:
        # second round should be at least as hard as the first
        order = ["easy", "medium", "hard"]
        first_round_difficulty = next(
            (q.difficulty.value for q in session.questions
             if q.question_type == "coding" and q.difficulty.value in order),
            "medium",
        )
        forced_difficulty = order[max(order.index(first_round_difficulty), order.index(base_difficulty))]

    problem = coding_question_agent.select_problem(
        company_intel=session.company_intel or {},
        difficulty=forced_difficulty,
        previously_asked_titles=_previously_asked_coding_titles(session),
    )

    # The question.text is a brief announcement read aloud by TTS.
    title = problem.get("title", "Coding Challenge")
    time_min = problem.get("time_limit_minutes", 20 if forced_difficulty == "medium" else 40)
    round_label = "first" if rounds_done == 0 else "second"
    difficulty_label = "medium" if forced_difficulty == "medium" else "hard"
    announcement = (
        f"Let's move to the {round_label} coding round. "
        f"This is a {difficulty_label}-level problem: {title}. "
        f"You have {time_min} minutes to solve it. "
        "Please read the problem statement carefully, then implement your solution."
    )

    q = Question(
        session_id=session.id,
        stage="coding_round",
        difficulty=DifficultyLevel(forced_difficulty),
        text=announcement,
        is_followup=False,
        question_type="coding",
        coding_problem=problem,
        order_index=len(session.questions),
    )
    db.add(q)
    db.flush()
    return q


def _generate_post_coding_question(
    db: DBSession,
    session: InterviewSession,
    coding_question: Question,
    code_eval: dict,
) -> Question | None:
    """
    Generate the first post-coding voice follow-up.
    Picks from the follow_up_questions the evaluation agent produced.
    """
    follow_ups = code_eval.get("follow_up_questions", [])
    if follow_ups:
        text = follow_ups[0]
    else:
        text = (
            "Great, let's discuss your solution. "
            "Can you walk me through your approach and explain the time and space complexity?"
        )

    q = Question(
        session_id=session.id,
        stage="coding_round",
        difficulty=session.current_difficulty,
        text=text,
        is_followup=True,
        parent_question_id=coding_question.id,
        question_type="voice",
        coding_problem=None,
        order_index=len(session.questions),
    )
    db.add(q)
    db.flush()
    return q


# ── Public API ────────────────────────────────────────────────────────────────

def start_session(
    db: DBSession,
    user_id: uuid.UUID,
    resume: Resume,
    target_company: str,
    target_role: str,
) -> InterviewSession:
    """
    Create and initialise a new interview session.

    Steps:
      1. Research the company via DuckDuckGo + LLM → company_intel
      2. Build an adaptive stage plan with planner_agent
      3. Generate the first question
    """
    logger.info("Starting company research for %r / %r", target_company, target_role)
    company_intel = company_research_service.research(db, target_company, target_role)
    logger.info("Research complete: %d focus areas", len(company_intel.get("focus_areas", [])))

    plan = planner_agent.build_plan(
        profile=resume.profile,
        target_company=target_company,
        target_role=target_role,
        company_intel=company_intel,
    )

    session = InterviewSession(
        user_id=user_id,
        resume_id=resume.id,
        target_company=target_company,
        target_role=target_role,
        status=SessionStatus.IN_PROGRESS,
        current_stage=InterviewStage.RESUME_DISCUSSION.value,
        current_difficulty=DifficultyLevel.MEDIUM,
        plan=plan,
        company_intel=company_intel,
        memory={"strong_topics": [], "weak_topics": [], "concepts_discussed": [], "mistakes": []},
    )
    db.add(session)
    db.flush()

    _generate_next_question(db, session, resume)
    db.commit()
    db.refresh(session)
    return session


def submit_answer(
    db: DBSession,
    session: InterviewSession,
    question: Question,
    answer_text: str,
    resume: Resume,
) -> dict:
    """
    Process a voice answer:
      evaluate → memory → difficulty → follow-up decision → adaptive stage decision.
    """
    if not answer_text.strip():
        raise ValueError("Answer text cannot be empty.")

    current_stage = _stage_str(session)

    # ── Evaluate ──────────────────────────────────────────────────────────────
    if current_stage == "mcq" and question.mcq_data:
        correct_opt = question.mcq_data.get("correct_option", "")
        
        ans_lower = answer_text.strip().lower()
        corr_lower = correct_opt.strip().lower()
        
        import re
        ans_clean = re.sub(r'^[a-d][\.\)]\s*', '', ans_lower)
        corr_clean = re.sub(r'^[a-d][\.\)]\s*', '', corr_lower)
        
        is_correct = (
            (ans_clean == corr_clean) or 
            (ans_clean and ans_clean in corr_clean) or 
            (corr_clean and corr_clean in ans_clean)
        )
            
        evaluation = {
            "overall_score": 100 if is_correct else 0,
            "raw_llm_score": 100 if is_correct else 0,
            "technical_accuracy": 100 if is_correct else 0,
            "completeness": 100 if is_correct else 0,
            "confidence": 100,
            "communication": 100,
            "depth": 100 if is_correct else 0,
            "feedback": question.mcq_data.get("explanation", "The correct answer is: " + correct_opt),
            "primary_topic": "MCQ topic",
            "answers_current_question": True,
        }
    else:
        evaluation = evaluation_agent.evaluate_answer(
            question=question.text,
            answer=answer_text,
            stage=current_stage,
            difficulty=question.difficulty.value,
        )

    answer = Answer(question_id=question.id, text=answer_text, evaluation=evaluation)
    db.add(answer)

    # ── Update memory & difficulty ────────────────────────────────────────────
    session.memory = memory_agent.update_memory(
        session.memory, 
        evaluation.get("primary_topic") or question.text[:120], 
        evaluation
    )
    overall_score: int = evaluation.get("overall_score", 0)
    prev_overall_score = None
    if len(session.questions) > 1:
        prev_q = session.questions[-2]
        if prev_q.answer and prev_q.answer.evaluation:
            prev_overall_score = prev_q.answer.evaluation.get("overall_score")
            
    session.current_difficulty = DifficultyLevel(
        difficulty_agent.next_difficulty(session.current_difficulty.value, overall_score, prev_overall_score)
    )

    # ── Follow-up check ───────────────────────────────────────────────────────
    followup_decision: dict = {"should_follow_up": False, "follow_up_question": None, "reason": None}
    if not question.is_followup and current_stage != "mcq":
        followup_decision = followup_agent.evaluate_followup_need(
            question.text, answer_text, session.current_difficulty.value
        )

    evaluation["should_follow_up"] = followup_decision.get("should_follow_up", False)
    evaluation["follow_up_reason"] = followup_decision.get("reason")

    next_question: Question | None = None

    if followup_decision.get("should_follow_up") and followup_decision.get("follow_up_question"):
        next_question = Question(
            session_id=session.id,
            stage=current_stage,
            difficulty=session.current_difficulty,
            text=followup_decision["follow_up_question"],
            is_followup=True,
            parent_question_id=question.id,
            question_type="voice",
            coding_problem=None,
            order_index=len(session.questions),
        )
        db.add(next_question)
        db.flush()
    else:
        # ── Adaptive stage decision ───────────────────────────────────────────
        stage_count = _stage_question_count(session, current_stage)
        main_questions_count = sum(1 for q in session.questions if not q.is_followup)
        action = adaptive_stage_agent.decide_next_action(
            current_stage=current_stage,
            plan=session.plan,
            memory=session.memory,
            total_answered=main_questions_count,
            stage_answered=stage_count,
            last_score=overall_score,
            coding_rounds_completed=_coding_rounds_completed(session),
            company_intel=session.company_intel or {},
            max_questions=settings.MAX_INTERVIEW_QUESTIONS,
        )

        act = action.get("action", "continue")
        logger.info(
            "Adaptive stage agent → %s (next_stage=%s) | %s",
            act, action.get("next_stage"), action.get("rationale"),
        )

        if act == "complete":
            # Guard: ensure behavioral isn't skipped if planned
            if "behavioral" in session.plan.get("stages", []) and not any(q.stage == "behavioral" for q in session.questions):
                act = "next_stage"
                next_stage_str = "behavioral"
                session.current_stage = next_stage_str
                next_question = _generate_regular_question(db, session, resume)
            else:
                session.status = SessionStatus.COMPLETED

        elif act in ("next_stage", "coding_round"):
            # Determine next stage
            if act == "coding_round":
                next_stage_str = "coding_round"
            else:
                next_stage_str = action.get("next_stage") or adaptive_stage_agent._find_next_in_plan(
                    session.plan.get("stages", []), current_stage, main_questions_count
                )
                if not next_stage_str:
                    session.status = SessionStatus.COMPLETED
                    db.flush()
                    return _build_response(evaluation, None, session)

            session.current_stage = next_stage_str

            if next_stage_str == "coding_round":
                next_question = _generate_coding_question(db, session)
            else:
                next_question = _generate_next_question(db, session, resume)

        else:  # "continue"
            next_question = _generate_next_question(db, session, resume)

    db.flush()
    return _build_response(evaluation, next_question, session)


def submit_code_answer(
    db: DBSession,
    session: InterviewSession,
    question: Question,
    language: str,
    code: str,
    approach_explanation: str,
    resume: Resume,
) -> dict:
    """
    Process a coding round submission:
      judge0 test cases → code evaluation → post-coding voice follow-up.
    """
    problem = question.coding_problem or {}
    test_cases = [tc for tc in problem.get("test_cases", [])]  # include all (hidden + visible)

    # ── Run test cases via Judge0 ─────────────────────────────────────────────
    logger.info(
        "Running %d test cases for coding question %s (lang=%s)",
        len(test_cases), question.id, language,
    )
    judge_result = judge_service.run_test_cases(language, code, test_cases)

    # ── Code evaluation ───────────────────────────────────────────────────────
    code_eval = evaluation_agent.evaluate_code_solution(
        problem=problem,
        code=code,
        language=language,
        judge0_result=judge_result,
        approach_explanation=approach_explanation,
    )

    # ── Persist answer ────────────────────────────────────────────────────────
    summary_text = (
        f"[{language.upper()} code — "
        f"{judge_result['tests_passed']}/{judge_result['tests_total']} tests passed]"
        f" {approach_explanation or ''}".strip()
    )
    answer = Answer(
        question_id=question.id,
        text=summary_text,
        evaluation=code_eval,
        code_submission={
            "language": language,
            "code": code,
            "approach_explanation": approach_explanation,
            "judge_result": judge_result,
        },
    )
    db.add(answer)

    # ── Memory + difficulty ───────────────────────────────────────────────────
    session.memory = memory_agent.update_memory(
        session.memory,
        code_eval.get("primary_topic") or f"Coding Round: {problem.get('title', 'coding problem')}",
        code_eval,
    )
    # Only adjust difficulty if we actually got real test results.
    # If execution_error=True the score is neutral (50) and should not affect difficulty.
    if not judge_result.get("execution_error", False):
        prev_overall_score = None
        if len(session.questions) > 1:
            prev_q = session.questions[-2]
            if prev_q.answer and prev_q.answer.evaluation:
                prev_overall_score = prev_q.answer.evaluation.get("overall_score")
                
        session.current_difficulty = DifficultyLevel(
            difficulty_agent.next_difficulty(
                session.current_difficulty.value,
                code_eval.get("overall_score", 0),
                prev_overall_score,
            )
        )

    # ── Generate voice follow-up about the code ───────────────────────────────
    next_question = _generate_post_coding_question(db, session, question, code_eval)

    db.flush()
    return {
        "evaluation": code_eval,
        "next_question": next_question,
        "session_status": session.status.value,
        "current_stage": _stage_str(session),
        "current_difficulty": session.current_difficulty.value,
    }


def finalize_report(db: DBSession, session: InterviewSession) -> Report:
    """Generate and persist the rich final report for a completed session."""
    transcript = []
    for i, q in enumerate(session.questions, start=1):
        if not q.answer:
            continue
        ev = q.answer.evaluation or {}
        transcript.append({
            "question_number": i,
            "stage": q.stage if isinstance(q.stage, str) else q.stage.value,
            "difficulty": q.difficulty.value,
            "is_followup": q.is_followup,
            "question_type": q.question_type,
            "question": q.text,
            "candidate_answer": q.answer.text,
            # Shared score fields
            "overall_score": ev.get("overall_score", 0),
            "raw_llm_score": ev.get("raw_llm_score", 0),
            "technical_accuracy": ev.get("technical_accuracy", 0),
            "completeness": ev.get("completeness", 0),
            "confidence": ev.get("confidence", 0),
            "communication": ev.get("communication", 0),
            "depth": ev.get("depth", 0),
            # Relevance (voice questions)
            "relevance_classification": ev.get("relevance_classification", "N/A"),
            "relevance_score": ev.get("relevance_score", 0),
            "answers_current_question": ev.get("answers_current_question", True),
            "score_cap": ev.get("score_cap", 100),
            # Coding-specific (coding questions)
            "correctness_score": ev.get("correctness_score"),
            "tests_passed": ev.get("tests_passed"),
            "tests_total": ev.get("tests_total"),
            "time_complexity": ev.get("time_complexity"),
            "space_complexity": ev.get("space_complexity"),
            # Narrative
            "strengths": ev.get("strengths", []),
            "missing_requirements": ev.get("missing_requirements", []),
            "feedback": ev.get("feedback", ""),
        })

    resume: Resume | None = db.get(Resume, session.resume_id)
    resume_profile = resume.profile if resume else None
    github_validation = resume.github_validation if resume else None

    result = report_agent.generate_report(
        transcript=transcript,
        target_company=session.target_company,
        target_role=session.target_role,
        resume_profile=resume_profile,
        github_validation=github_validation,
    )

    def _flat_strings(val: object) -> list[str]:
        if not isinstance(val, list):
            return []
        out: list[str] = []
        for item in val:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                out.append(item.get("strength") or item.get("topic") or str(item))
        return out

    report = Report(
        session_id=session.id,
        overall_score=result.get("overall_score", 0),
        technical_score=result.get("technical_score", 0),
        behavioral_score=result.get("behavioral_score", 0),
        communication_score=result.get("communication_score", 0),
        strengths=_flat_strings(result.get("strengths", [])),
        weaknesses=_flat_strings(result.get("weaknesses", [])),
        hiring_recommendation=result.get("hiring_recommendation", "Lean Hire"),
        learning_plan=[
            d.get("topic", str(d)) if isinstance(d, dict) else str(d)
            for d in result.get("seven_day_plan", [])
        ],
        summary=result.get("summary", result.get("executive_summary", "")),
        full_report=result,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


# ── Internal response builder ─────────────────────────────────────────────────

def _build_response(evaluation: dict, next_question: Question | None, session: InterviewSession) -> dict:
    return {
        "evaluation": evaluation,
        "next_question": next_question,
        "session_status": session.status.value,
        "current_stage": _stage_str(session),
        "current_difficulty": session.current_difficulty.value,
    }
