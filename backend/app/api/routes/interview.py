import time
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.interview import InterviewSession, Question, SessionStatus
from app.models.resume import Resume
from app.models.user import User
from app.schemas.interview import (
    CodeHintRequest,
    CodeHintResponse,
    CodingProblemSchema,
    CodeSubmitRequest,
    CodeSubmitResponse,
    CodeEvaluationResponse,
    QuestionResponse,
    RecordViolationRequest,
    SessionResponse,
    StartInterviewRequest,
    STTResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    TTSRequest,
)
from app.services import interview_orchestrator, voice_service
from app.services.agents import code_hint_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/interviews", tags=["interviews"])

# Simple in-process rate limiter for code hints (session_id → last_hint_timestamp)
_hint_last_called: dict[str, float] = {}
_HINT_COOLDOWN_SECONDS = 45


def _get_owned_session(db: Session, session_id: uuid.UUID, user: User) -> InterviewSession:
    session = db.get(InterviewSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    return session


def _serialise_question(q: Question) -> QuestionResponse:
    """
    Serialise a Question ORM object → QuestionResponse.
    Strips hidden test_cases from coding_problem so candidates cannot
    reverse-engineer expected outputs from the response.
    """
    coding_problem_public = None
    if q.question_type == "coding" and q.coding_problem:
        raw = dict(q.coding_problem)
        raw.pop("test_cases", None)     # never expose test cases to frontend
        # Keep only public examples
        try:
            coding_problem_public = CodingProblemSchema(**raw)
        except Exception:
            coding_problem_public = None

    return QuestionResponse(
        id=q.id,
        stage=q.stage if isinstance(q.stage, str) else q.stage.value,
        difficulty=q.difficulty.value,
        text=q.text,
        is_followup=q.is_followup,
        order_index=q.order_index,
        question_type=q.question_type,
        coding_problem=coding_problem_public,
        mcq_data=q.mcq_data,
        # Expose stored answer so the frontend can rebuild transcript on refresh
        answer_text=q.answer.text if q.answer else None,
        answer_evaluation=q.answer.evaluation if q.answer else None,
    )


@router.post("/start", response_model=SessionResponse)
def start_interview(
    payload: StartInterviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resume = db.get(Resume, uuid.UUID(payload.resume_id))
    if not resume or resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found.")

    session = interview_orchestrator.start_session(
        db, current_user.id, resume, payload.target_company, payload.target_role
    )
    return session


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_owned_session(db, session_id, current_user)


@router.post("/{session_id}/violation")
def record_violation(
    session_id: uuid.UUID,
    payload: RecordViolationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user)
    
    if payload.violation_type == "tab_switch":
        session.tab_switches += 1
    elif payload.violation_type == "look_away":
        session.look_away_count += 1
        session.head_turned_duration_seconds += payload.duration_seconds
    elif payload.violation_type == "face_not_detected":
        session.face_not_detected_duration_seconds += payload.duration_seconds
    elif payload.violation_type == "multiple_faces":
        session.multiple_faces_detected_count += 1

    status = "ok"
    if session.tab_switches >= 3:
        session.status = SessionStatus.COMPLETED
        status = "terminated"

    db.commit()
    return {
        "status": status,
        "tab_switches": session.tab_switches,
        "look_away_count": session.look_away_count,
    }


@router.get("/{session_id}/questions", response_model=list[QuestionResponse])
def list_questions(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user)
    return [_serialise_question(q) for q in session.questions]


@router.post("/{session_id}/answer", response_model=SubmitAnswerResponse)
def submit_answer(
    session_id: uuid.UUID,
    payload: SubmitAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user)
    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="This interview session is already completed.")

    question = db.get(Question, uuid.UUID(payload.question_id))
    if not question or question.session_id != session.id:
        raise HTTPException(status_code=404, detail="Question not found in this session.")

    # Idempotent: if already answered, return the stored evaluation + next question
    # so the frontend can advance without showing an error (handles double-submit race).
    if question.answer:
        answered_questions = sorted(session.questions, key=lambda q: q.order_index)
        answered_indices = [i for i, q in enumerate(answered_questions) if q.id == question.id]
        next_q = None
        if answered_indices:
            next_idx = answered_indices[0] + 1
            if next_idx < len(answered_questions):
                next_q = answered_questions[next_idx]
        return {
            "evaluation": question.answer.evaluation or {},
            "next_question": _serialise_question(next_q) if next_q else None,
            "session_status": session.status.value,
            "current_stage": session.current_stage if isinstance(session.current_stage, str) else session.current_stage.value,
            "current_difficulty": session.current_difficulty.value,
        }

    if not payload.text.strip():
        raise HTTPException(status_code=422, detail="Answer cannot be empty.")

    resume = db.get(Resume, session.resume_id)
    result = interview_orchestrator.submit_answer(db, session, question, payload.text, resume)
    db.commit()

    nq = result.get("next_question")
    if nq:
        db.refresh(nq)
        result["next_question"] = _serialise_question(nq)

    return result



@router.post("/{session_id}/code", response_model=CodeSubmitResponse)
def submit_code(
    session_id: uuid.UUID,
    payload: CodeSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a code solution for the coding round.

    Runs all test cases via Judge0, evaluates code quality, and returns a
    full CodeEvaluation plus the next voice follow-up question.
    """
    session = _get_owned_session(db, session_id, current_user)
    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="This interview session is already completed.")

    question = db.get(Question, uuid.UUID(payload.question_id))
    if not question or question.session_id != session.id:
        raise HTTPException(status_code=404, detail="Question not found in this session.")
    if question.question_type != "coding":
        raise HTTPException(status_code=400, detail="This question is not a coding question.")
    if question.answer:
        raise HTTPException(status_code=400, detail="This question has already been answered.")

    resume = db.get(Resume, session.resume_id)
    result = interview_orchestrator.submit_code_answer(
        db=db,
        session=session,
        question=question,
        language=payload.language,
        code=payload.code,
        approach_explanation=payload.approach_explanation,
        resume=resume,
    )
    db.commit()

    nq = result.get("next_question")
    if nq:
        db.refresh(nq)
        result["next_question"] = _serialise_question(nq)

    return result


# ── Code Hint endpoint ───────────────────────────────────────────────────────

@router.post("/{session_id}/code-hint", response_model=CodeHintResponse)
def get_code_hint(
    session_id: uuid.UUID,
    payload: CodeHintRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a live coding hint for the candidate.

    Called by the frontend every ~2 minutes during the coding round.
    Returns a spoken hint/question the AI coach wants to ask.

    Rate-limited to 1 call per 90 seconds per session to prevent LLM abuse.
    The hint is generated by code_hint_agent.generate_hint() which:
      - Reads the current code snapshot
      - Checks elapsed time and hint history
      - Produces a contextual probe: plan, brute force, optimisation, edge case, etc.
    """
    session = _get_owned_session(db, session_id, current_user)
    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Session is already completed.")

    # Rate limiting — prevent hammering the LLM
    session_key = str(session_id)
    last_called = _hint_last_called.get(session_key, 0)
    now = time.time()
    if now - last_called < _HINT_COOLDOWN_SECONDS:
        wait = int(_HINT_COOLDOWN_SECONDS - (now - last_called))
        return CodeHintResponse(
            hint_text="",
            hint_type="COOLDOWN",
            should_speak=False,
        )
    _hint_last_called[session_key] = now

    question = db.get(Question, uuid.UUID(payload.question_id))
    if not question or question.session_id != session.id:
        raise HTTPException(status_code=404, detail="Question not found in this session.")
    if question.question_type != "coding":
        raise HTTPException(status_code=400, detail="Code hints only work for coding questions.")

    problem = question.coding_problem or {}

    try:
        result = code_hint_agent.generate_hint(
            problem=problem,
            code=payload.code,
            language=payload.language,
            elapsed_seconds=payload.elapsed_seconds,
            hints_given=payload.hints_given,
            company_intel=session.company_intel,
        )
    except Exception as exc:
        logger.error("Code hint generation failed: %s", exc)
        return CodeHintResponse(
            hint_text="Keep going! You're doing well.",
            hint_type="ENCOURAGEMENT",
            should_speak=True,
        )

    return CodeHintResponse(
        hint_text=result.get("hint_text", ""),
        hint_type=result.get("hint_type", "ENCOURAGEMENT"),
        should_speak=result.get("should_speak", True),
    )


# ── Voice endpoints ───────────────────────────────────────────────────────────

@router.post("/{session_id}/tts")
async def text_to_speech(
    session_id: uuid.UUID,
    payload: TTSRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stream MP3 audio for question_text from the OpenAI TTS model.
    First bytes arrive ~200-400 ms after request — frontend MSE pipeline
    starts playback immediately.
    """
    _get_owned_session(db, session_id, current_user)
    if not payload.question_text.strip():
        raise HTTPException(status_code=422, detail="question_text cannot be empty.")

    return StreamingResponse(
        voice_service.stream_tts(payload.question_text, payload.voice),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
            "Content-Disposition": "inline; filename=question.mp3",
        },
    )


@router.post("/{session_id}/stt", response_model=STTResponse)
async def speech_to_text(
    session_id: uuid.UUID,
    audio: UploadFile = File(..., description="Recorded audio (webm, wav, m4a, …)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transcribe uploaded audio via Whisper and return the text."""
    _get_owned_session(db, session_id, current_user)

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Audio file is empty.")

    transcript = await voice_service.stt_async(
        audio_bytes=audio_bytes,
        filename=audio.filename or "recording.webm",
    )
    if not transcript:
        raise HTTPException(
            status_code=422,
            detail="Could not transcribe audio. Please speak clearly and try again.",
        )
    return STTResponse(transcript=transcript)
