import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SessionStatus(str, enum.Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    TERMINATED = "terminated"


class InterviewStage(str, enum.Enum):
    RESUME_DISCUSSION = "resume_discussion"
    TECHNICAL = "technical"
    CODING_ROUND = "coding_round"
    PROJECT_DEEP_DIVE = "project_deep_dive"
    BEHAVIORAL = "behavioral"
    SYSTEM_DESIGN = "system_design"
    CS_FUNDAMENTALS = "cs_fundamentals"
    MCQ = "mcq"
    WRAP_UP = "wrap_up"


class DifficultyLevel(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    SENIOR = "senior"
    STAFF = "staff"


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    resume_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id"), nullable=False)

    target_company: Mapped[str] = mapped_column(String(255), nullable=False)
    target_role: Mapped[str] = mapped_column(String(255), nullable=False, default="Software Engineer")

    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.PLANNED)
    current_stage: Mapped[str] = mapped_column(String(50), default=InterviewStage.RESUME_DISCUSSION.value)
    current_difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel), default=DifficultyLevel.MEDIUM)

    # Interview plan produced by the Interview Planner Agent: ordered list of stages.
    plan: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Rolling memory produced/consumed by the Memory Agent.
    memory: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # ── NEW: Company intelligence gathered by the web research service ────────
    # { company_name, interview_structure, focus_areas, commonly_asked_questions,
    #   coding_problems, behavioral_themes, technical_emphasis, lp_principles,
    #   company_values, system_design_topics, interview_tips, known_for, sources }
    company_intel: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # ── NEW: Proctoring violations tracking ───────────────────────────────────
    tab_switches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    look_away_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    head_turned_duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    face_not_detected_duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    multiple_faces_detected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Termination tracking ──────────────────────────────────────────────────
    termination_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    termination_violation_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    owner = relationship("User", back_populates="sessions")
    questions = relationship(
        "Question",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Question.created_at",
    )
    report = relationship("Report", back_populates="session", uselist=False, cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False)

    stage: Mapped[str] = mapped_column(String(50), nullable=False)
    difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_followup: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_question_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=True)

    # ── NEW: question type ───────────────────────────────────────────────────
    # "voice"  – spoken question answered via microphone (existing flow)
    # "coding" – embedded coding assessment answered in Monaco editor
    question_type: Mapped[str] = mapped_column(String(20), nullable=False, default="voice")

    # ── NEW: full coding problem spec (populated only when question_type="coding") ─
    # { title, description, constraints, examples, test_cases, starter_code,
    #   time_limit_minutes, topics, difficulty, approach_hint }
    coding_problem: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    # ── NEW: mcq spec (populated only when question_type="mcq") ─────────────
    # { options: list[str], correct_option: str, explanation: str }
    mcq_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("InterviewSession", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False, cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id"), unique=True, nullable=False)

    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Evaluation produced by the Evaluation Agent.
    evaluation: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # ── NEW: code submission (populated only for coding questions) ───────────
    # { language, code, approach_explanation, judge0_result }
    code_submission: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="answer")


class CompanyIntelCache(Base):
    __tablename__ = "company_intel_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    target_role: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    intel_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── NEW: Token Revocation for JWT Blacklisting ────────────────────────────────
class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jti: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user = relationship("User")
