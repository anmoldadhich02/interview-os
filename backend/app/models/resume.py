import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Resume(Base):
    """
    Stores the raw extracted resume text plus the structured candidate
    profile produced by the Resume Intelligence Agent.
    """
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)

    # Structured candidate profile, produced by the Resume Intelligence Agent:
    # { skills: [...], projects: [...], experience: [...], education: [...],
    #   achievements: [...], certifications: [...], seniority_estimate: "..." }
    profile: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # GitHub project-validation report produced by the GitHub Validation Agent.
    # Null while analysis is still running (background task); populated once done.
    github_validation: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="resumes")
