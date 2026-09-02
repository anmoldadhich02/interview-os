from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class CandidateProfile(BaseModel):
    skills: list[str] = []
    projects: list[dict] = []
    experience: list[dict] = []
    education: list[dict] = []
    achievements: list[str] = []
    certifications: list[str] = []
    seniority_estimate: str = "mid"


class ResumeResponse(BaseModel):
    id: UUID
    original_filename: str
    profile: CandidateProfile
    github_validation: Any | None = None
    created_at: datetime

    class Config:
        from_attributes = True