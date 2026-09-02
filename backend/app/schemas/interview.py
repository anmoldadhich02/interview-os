from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ── Interview session schemas ─────────────────────────────────────────────────

class StartInterviewRequest(BaseModel):
    resume_id: str
    target_company: str
    target_role: str = "Software Engineer"


class SessionResponse(BaseModel):
    id: UUID
    target_company: str
    target_role: str
    status: str
    current_stage: str
    current_difficulty: str
    tab_switches: int = 0
    termination_reason: str | None = None
    termination_violation_count: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class RecordViolationRequest(BaseModel):
    violation_type: str = "tab_switch"
    duration_seconds: int = 0


# ── Coding problem schema (public — no hidden test cases) ─────────────────────

class CodingExample(BaseModel):
    input: str
    output: str
    explanation: str = ""


class CodingProblemSchema(BaseModel):
    """
    Coding problem spec sent to the frontend.
    Hidden test_cases are stripped before serialisation — only public examples
    are included so the candidate cannot reverse-engineer expected outputs.
    """
    title: str
    description: str
    constraints: list[str] = []
    examples: list[CodingExample] = []
    starter_code: dict[str, str] = {}   # { "python": "...", "cpp": "..." }
    time_limit_minutes: int = 35
    topics: list[str] = []
    difficulty: str = "medium"
    approach_hint: str = ""


# ── Question schema ───────────────────────────────────────────────────────────

class QuestionResponse(BaseModel):
    id: UUID
    stage: str
    difficulty: str
    text: str
    is_followup: bool
    order_index: int
    question_type: str = "voice"                          # "voice" | "coding"
    coding_problem: CodingProblemSchema | None = None     # populated for coding questions
    mcq_data: dict | None = None
    # Populated when the question has already been answered (used for session resume on refresh)
    answer_text: str | None = None
    answer_evaluation: dict | None = None

    class Config:
        from_attributes = True


# ── Answer submission schemas ─────────────────────────────────────────────────

class SubmitAnswerRequest(BaseModel):
    question_id: str
    text: str


class EvaluationResponse(BaseModel):
    # ── Core scoring ──────────────────────────────────────────────────────
    technical_accuracy: int
    completeness: int
    confidence: int
    communication: int
    depth: int
    overall_score: int
    raw_llm_score: int = 0
    feedback: str

    # ── Relevance classification ──────────────────────────────────────────
    relevance_classification: str = "DIRECTLY_RELEVANT"
    relevance_score: int = 0
    answers_current_question: bool = True
    score_cap: int = 100
    reason_for_score_cap: str | None = None

    # ── Narrative ─────────────────────────────────────────────────────────
    strengths: list[str] = []
    missing_requirements: list[str] = []

    # ── Follow-up control ─────────────────────────────────────────────────
    should_follow_up: bool = False
    follow_up_reason: str | None = None


class SubmitAnswerResponse(BaseModel):
    evaluation: EvaluationResponse
    next_question: QuestionResponse | None
    session_status: str
    current_stage: str
    current_difficulty: str


# ── Code submission schemas ───────────────────────────────────────────────────

class CodeSubmitRequest(BaseModel):
    question_id: str
    language: str           # "python" | "cpp" | "java" | "javascript" | "go" | ...
    code: str
    approach_explanation: str = ""


class CodeRunRequest(BaseModel):
    language: str
    code: str
    stdin: str = ""


class CodeEvaluationResponse(BaseModel):
    """Evaluation returned for a coding question submission."""
    # Correctness (from Judge0 test results)
    tests_passed: int = 0
    tests_total: int = 0
    # None = execution service error (not evaluated) — distinct from 0 = wrong
    correctness_score: int | None = 0

    # Complexity
    time_complexity: str = "Unknown"
    space_complexity: str = "Unknown"
    complexity_score: int = 0

    # Quality
    code_quality_score: int = 0
    readability_score: int = 0

    # Overall
    overall_score: int = 0
    feedback: str = ""
    approach: str = ""
    strengths: list[str] = []
    issues: list[str] = []
    optimal_approach: str = ""
    follow_up_questions: list[str] = []

    # Shared fields expected by frontend Evaluation interface
    should_follow_up: bool = True

    # Execution service error flag — when True, the score is neutral (not penalised)
    execution_service_error: bool = False
    execution_error_code: str | None = None


class CodeSubmitResponse(BaseModel):
    evaluation: CodeEvaluationResponse
    next_question: QuestionResponse | None   # voice follow-up about the code
    session_status: str
    current_stage: str
    current_difficulty: str


# ── Voice endpoint schemas ────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    """Request body for POST /api/interviews/{session_id}/tts."""
    question_text: str
    voice: str = "alloy"  # alloy | echo | fable | onyx | nova | shimmer


class STTResponse(BaseModel):
    """Response body for POST /api/interviews/{session_id}/stt."""
    transcript: str


# ── Live code hint schemas ────────────────────────────────────────────────────

class CodeHintRequest(BaseModel):
    """
    POST /api/interviews/{session_id}/code-hint
    Called by the frontend every ~2 minutes during the coding round.
    """
    question_id:     str
    language:        str
    code:            str
    elapsed_seconds: int           # seconds since coding question was presented
    hints_given:     list[str] = []  # hint_type strings already played this session


class CodeHintResponse(BaseModel):
    """
    Response from POST /api/interviews/{session_id}/code-hint.

    hint_text:    The spoken hint. Empty string if should_speak=False.
    hint_type:    Category of hint (PLAN_REQUEST, BRUTE_FORCE, etc.)
    should_speak: True if the frontend should play this via TTS.
                  False if the candidate hasn't started and it's too early.
    """
    hint_text:    str
    hint_type:    str
    should_speak: bool

