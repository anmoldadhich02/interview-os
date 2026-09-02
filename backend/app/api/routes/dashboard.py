from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.interview import InterviewSession, SessionStatus
from app.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == current_user.id)
        .order_by(InterviewSession.created_at.desc())
        .all()
    )

    completed = [s for s in sessions if s.status == SessionStatus.COMPLETED]
    scores = [s.report.overall_score for s in completed if s.report]
    average_score = round(sum(scores) / len(scores), 1) if scores else None

    return {
        "total_interviews": len(sessions),
        "completed_interviews": len(completed),
        "average_score": average_score,
        "recent_sessions": [
            {
                "id": str(s.id),
                "target_company": s.target_company,
                "target_role": s.target_role,
                "status": s.status.value,
                "created_at": s.created_at.isoformat(),
                "overall_score": s.report.overall_score if s.report else None,
            }
            for s in sessions[:10]
        ],
    }
