import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import SessionLocal, get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import ResumeResponse
from app.services.agents import resume_agent
from app.services.resume_parser import extract_text_from_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resumes", tags=["resumes"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


@router.post("/upload", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10MB).")

    try:
        raw_text = extract_text_from_pdf(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    profile = resume_agent.analyze_resume(raw_text)

    resume = Resume(
        user_id=current_user.id,
        original_filename=file.filename or "resume.pdf",
        raw_text=raw_text,
        profile=profile,
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)

    return resume


@router.get("", response_model=list[ResumeResponse])
def list_resumes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Resume)
        .filter(Resume.user_id == current_user.id)
        .order_by(Resume.created_at.desc())
        .all()
    )


@router.get("/{resume_id}", response_model=ResumeResponse)
def get_resume(resume_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resume = db.get(Resume, resume_id)
    if not resume or resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return resume


@router.get("/{resume_id}/github-validation")
def get_github_validation(
    resume_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the GitHub validation report for a resume.
    Since the GitHub validation agent has been removed, this always returns status "complete" with None.
    """
    resume = db.get(Resume, resume_id)
    if not resume or resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found.")

    return {"status": "complete", "data": None}

