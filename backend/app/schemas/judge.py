from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class RunRequest(BaseModel):
    """POST /api/judge/run — run code with custom stdin, return stdout/stderr."""
    language: str
    code: str
    stdin: str = ""


class RunResult(BaseModel):
    """Response from /api/judge/run."""
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    compile_error: Optional[str] = None
    status: str = "Unknown"
    time: Optional[str] = None
    memory: Optional[int] = None
    execution_error: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None


# ── Test-case execution schemas ───────────────────────────────────────────────

class TestCaseResult(BaseModel):
    """Result for a single test case execution."""
    input: str
    expected: str
    actual: str = ""
    # passed=True → correct; passed=False → wrong; passed=None → execution error (not evaluated)
    passed: Optional[bool] = None
    status: str = "Unknown"
    stderr: Optional[str] = None
    time: Optional[str] = None
    execution_error: bool = False


class RunTestsRequest(BaseModel):
    """
    POST /api/judge/run-tests — run code against the problem's visible test cases.
    Used by the frontend 'Run Code' button.
    """
    question_id: str
    language: str
    code: str


class RunTestsResponse(BaseModel):
    """
    Response from /api/judge/run-tests.

    execution_error=True means the execution provider failed — NOT that the code
    is wrong. The frontend MUST show this as a service error, not Wrong Answer.
    """
    tests_passed: int = 0
    tests_total: int = 0
    evaluated_total: int = 0
    pass_rate: float = 0.0
    execution_error: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    results: list[TestCaseResult] = []
