from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import Base, engine
from app.api.routes import auth, dashboard, interview, judge, report, resume

# Import models so they register on Base.metadata before create_all runs.
from app.models import interview as _interview_models  # noqa: F401
from app.models import report as _report_models  # noqa: F401
from app.models import resume as _resume_models  # noqa: F401
from app.models import user as _user_models  # noqa: F401

settings = get_settings()

app = FastAPI(
    title="InterviewOS API",
    description="AI Interview Platform — agentic backend",
    version="0.2.0",
)

frontend_origins = [o.strip() for o in settings.FRONTEND_ORIGIN.split(",") if o.strip()]
for origin in ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:3000"]:
    if origin not in frontend_origins:
        frontend_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(resume.router)
app.include_router(interview.router)
app.include_router(report.router)
app.include_router(dashboard.router)
app.include_router(judge.router)


def _run_db_migrations() -> None:
    """
    Apply incremental schema changes that create_all() cannot handle.

    These ALTER TABLE / ADD COLUMN statements are idempotent (IF NOT EXISTS)
    so they are safe to re-run on every startup for new columns.
    """
    column_migrations = [
        # Session-level company intelligence blob
        "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS company_intel JSONB DEFAULT '{}'::jsonb",
        # Per-question type and coding problem spec
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'voice'",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS coding_problem JSONB",
        # Changed current_stage from enum to varchar for extensibility
        # (Only needed if upgrading an existing DB with the old enum column)
        # Per-answer code submission blob
        "ALTER TABLE answers ADD COLUMN IF NOT EXISTS code_submission JSONB",
    ]

    with engine.connect() as conn:
        for stmt in column_migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                # Log but do NOT crash startup — column may already exist
                import logging
                logging.getLogger(__name__).debug("Migration skipped: %s (%s)", stmt[:60], exc)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    _run_db_migrations()


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "InterviewOS API", "version": "0.2.0"}
