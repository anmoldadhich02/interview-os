"""
Judge0 API Routes.

POST /api/judge/run        — run code with custom stdin (Run Code custom-input tab)
POST /api/judge/run-tests  — run code against all VISIBLE test cases (Run Code button)
POST /api/judge/submit     — run code against ALL test cases (Submit button, via interview endpoint)
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.interview import Question
from app.models.user import User
from app.schemas.judge import (
    RunRequest,
    RunResult,
    RunTestsRequest,
    RunTestsResponse,
    TestCaseResult,
)
from app.services import judge_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/judge", tags=["judge"])


@router.post("/run", response_model=RunResult)
def run_code(
    body: RunRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Execute code with optional custom stdin (no test-case checking).
    Returns stdout, stderr, compile errors, and execution metadata.
    Used by the frontend custom-input tab.
    """
    try:
        result = judge_service.run_code(
            language=body.language,
            source_code=body.code,
            stdin=body.stdin,
        )
        return result
    except ValueError as exc:
        # Unsupported language
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Judge run failed: %s", exc)
        return RunResult(
            stdout=None,
            stderr=f"Execution service error: {exc}",
            status="Error",
            execution_error=True,
            error_code="EXECUTION_SERVICE_ERROR",
            error_message=str(exc),
        )


@router.post("/run-tests", response_model=RunTestsResponse)
def run_tests(
    body: RunTestsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run code against ALL VISIBLE (public, is_hidden=False) test cases.

    Used by the frontend 'Run Code' button to show per-test-case pass/fail.

    SECURITY:
    - Hidden test cases are NEVER sent to the frontend.
    - Hidden test inputs and expected outputs are NEVER included in the response.
    - Only the question owner's session is allowed (via JWT auth).

    Returns per-test-case results including input, expected output, actual output,
    passed status, and execution time. When execution_error=True, the code has NOT
    been evaluated — this is an infrastructure failure, not a Wrong Answer.
    """
    try:
        question_id = uuid.UUID(body.question_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid question_id format.")

    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found.")

    # Verify the question belongs to a session owned by the current user
    if question.session and question.session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    if question.question_type != "coding":
        raise HTTPException(status_code=400, detail="This question is not a coding question.")

    problem = question.coding_problem or {}
    all_test_cases = problem.get("test_cases", [])

    # Filter to public (visible) test cases only
    public_tests = [tc for tc in all_test_cases if not tc.get("is_hidden", False)]

    if not public_tests:
        # No visible test cases — run with no test-case check
        # (This can happen for problems that only have hidden tests)
        logger.info("No public test cases for question %s", question_id)
        return RunTestsResponse(
            tests_passed=0,
            tests_total=0,
            evaluated_total=0,
            pass_rate=0.0,
            execution_error=False,
            error_message="No public test cases available for this problem. "
                          "Use the custom input tab to test your code.",
            results=[],
        )

    try:
        result = judge_service.run_public_tests(
            language=body.language,
            source_code=body.code,
            test_cases=public_tests,
        )
    except Exception as exc:
        logger.error("run-tests failed for question %s: %s", question_id, exc)
        return RunTestsResponse(
            tests_passed=0,
            tests_total=len(public_tests),
            execution_error=True,
            error_code="EXECUTION_SERVICE_ERROR",
            error_message=f"Code execution service error: {exc}",
            results=[],
        )

    # Build response — strip hidden test data (safety double-check)
    tc_results = []
    for r in result.get("results", []):
        tc_results.append(TestCaseResult(
            input=r.get("input", ""),
            expected=r.get("expected", ""),
            actual=r.get("actual", ""),
            passed=r.get("passed"),       # None = execution error, not false
            status=r.get("status", "Unknown"),
            stderr=r.get("stderr"),
            time=r.get("time"),
            execution_error=r.get("execution_error", False),
        ))

    return RunTestsResponse(
        tests_passed=result.get("tests_passed", 0),
        tests_total=result.get("tests_total", len(public_tests)),
        evaluated_total=result.get("evaluated_total", 0),
        pass_rate=result.get("pass_rate", 0.0),
        execution_error=result.get("execution_error", False),
        error_code=result.get("error_code"),
        error_message=result.get("error_message"),
        results=tc_results,
    )
