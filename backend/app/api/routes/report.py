import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.interview import InterviewSession, SessionStatus
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportResponse
from app.services import interview_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _to_response(report: Report) -> ReportResponse:
    """Convert a Report ORM object to the rich ReportResponse."""
    return ReportResponse.from_orm_with_full_report(report)


@router.post("/{session_id}/generate", response_model=ReportResponse)
def generate_report(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a report for a completed interview session.
    Idempotent: returns the existing report without regenerating it.
    """
    session = db.get(InterviewSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    if session.status != SessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Interview is not completed yet.")

    # Idempotency: return existing report without regenerating
    if session.report:
        logger.info("Returning existing report for session %s", session_id)
        return _to_response(session.report)

    logger.info("Generating new report for session %s", session_id)
    report = interview_orchestrator.finalize_report(db, session)
    return _to_response(report)


@router.get("/{session_id}", response_model=ReportResponse)
def get_report(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve an existing report.
    Returns 404 with a clear message if the report hasn't been generated yet.
    """
    session = db.get(InterviewSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    if not session.report:
        raise HTTPException(
            status_code=404,
            detail="Report not generated yet. Complete the interview first.",
        )
    return _to_response(session.report)
