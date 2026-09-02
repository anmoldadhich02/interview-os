"""
Test suite for judge_service.py — all HTTP calls are mocked.

CRITICAL invariant under test:
  A 401/403/429/5xx response from Judge0 must NEVER produce passed=False
  or correctness_score=0 for a valid submission.  It must produce
  execution_error=True and NOT penalise the candidate.

Run with:
  cd backend
  PYTHONPATH=. python tests/test_judge_service.py
"""
from __future__ import annotations

import sys
import os
import base64
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Colour helpers ─────────────────────────────────────────────────────────────
PASS_TAG  = "\033[92mPASS\033[0m"
FAIL_TAG  = "\033[91mFAIL\033[0m"
WARN_TAG  = "\033[93mWARN\033[0m"

results: list[bool] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    tag = PASS_TAG if condition else FAIL_TAG
    print(f"  [{tag}] {label}" + (f" — {detail}" if detail else ""))
    results.append(condition)


# ── Helpers to build mock httpx responses ────────────────────────────────────

def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _mock_response(status_code: int, json_data: dict) -> MagicMock:
    """Build a mock httpx.Response."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    mock.raise_for_status = MagicMock()
    if status_code >= 400:
        import httpx
        mock.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"HTTP {status_code}", request=MagicMock(), response=mock
        )
    return mock


def _accepted_submission_response() -> MagicMock:
    return _mock_response(200, {"token": "test-token-abc"})


def _accepted_poll_response(stdout: str = "3") -> MagicMock:
    return _mock_response(200, {
        "status": {"id": 3, "description": "Accepted"},
        "stdout": _b64(stdout),
        "stderr": None,
        "compile_output": None,
        "time": "0.050",
        "memory": 10240,
    })


def _wrong_answer_poll_response(stdout: str = "5") -> MagicMock:
    return _mock_response(200, {
        "status": {"id": 4, "description": "Wrong Answer"},
        "stdout": _b64(stdout),
        "stderr": None,
        "compile_output": None,
        "time": "0.045",
        "memory": 9000,
    })


def _compilation_error_poll_response() -> MagicMock:
    return _mock_response(200, {
        "status": {"id": 6, "description": "Compilation Error"},
        "stdout": None,
        "stderr": None,
        "compile_output": _b64("error: ';' expected"),
        "time": None,
        "memory": None,
    })


def _runtime_error_poll_response() -> MagicMock:
    return _mock_response(200, {
        "status": {"id": 11, "description": "Runtime Error (NZEC)"},
        "stdout": None,
        "stderr": _b64("Exception in thread 'main' java.lang.NullPointerException"),
        "compile_output": None,
        "time": "0.010",
        "memory": 5000,
    })


def _tle_poll_response() -> MagicMock:
    return _mock_response(200, {
        "status": {"id": 5, "description": "Time Limit Exceeded"},
        "stdout": None,
        "stderr": None,
        "compile_output": None,
        "time": None,
        "memory": None,
    })


# ── Import service under test ─────────────────────────────────────────────────

from app.services import judge_service


# ═════════════════════════════════════════════════════════════════════════════
# Section A: HTTP error classification
# ═════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("Section A: HTTP error classification (_classify_http_error)")
print("=" * 60)

r_401 = judge_service._classify_http_error(401)
check("401 → execution_error=True",    r_401["execution_error"] is True)
check("401 → error_code=AUTHENTICATION_ERROR", r_401["error_code"] == "AUTHENTICATION_ERROR")

r_403 = judge_service._classify_http_error(403)
check("403 → execution_error=True",    r_403["execution_error"] is True)
check("403 → error_code=ACCESS_DENIED", r_403["error_code"] == "ACCESS_DENIED")

r_429 = judge_service._classify_http_error(429)
check("429 → execution_error=True",    r_429["execution_error"] is True)
check("429 → error_code=RATE_LIMIT_EXCEEDED", r_429["error_code"] == "RATE_LIMIT_EXCEEDED")

r_500 = judge_service._classify_http_error(500)
check("500 → execution_error=True",    r_500["execution_error"] is True)
check("500 → error_code=SERVICE_UNAVAILABLE", r_500["error_code"] == "SERVICE_UNAVAILABLE")

r_503 = judge_service._classify_http_error(503)
check("503 → execution_error=True",    r_503["execution_error"] is True)
check("503 → error_code=SERVICE_UNAVAILABLE", r_503["error_code"] == "SERVICE_UNAVAILABLE")


# ═════════════════════════════════════════════════════════════════════════════
# Section B: Java code wrapping
# ═════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("Section B: Java code wrapping (_wrap_java_code)")
print("=" * 60)

count_vowels_java = """\
class Solution {
    public int solution(String s) {
        char[] compare = {'A','E','I','O','U','a','e','i','o','u'};
        int n = s.length();
        int count = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < compare.length; j++) {
                if (s.charAt(i) == compare[j]) {
                    count++;
                }
            }
        }
        return count;
    }
}"""

wrapped = judge_service._wrap_java_code(count_vowels_java)
check("Wrapped code contains 'class Main'",  "class Main" in wrapped)
check("Wrapped code contains 'main'",        "public static void main" in wrapped)
check("Wrapped code keeps Solution class",   "class Solution" in wrapped)
check("Wrapped code calls sol.solution(",    "sol.solution(" in wrapped)
check("Wrapped code reads String from stdin","scanner.nextLine()" in wrapped)

already_has_main = """\
public class MyProgram {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}"""
wrapped_main = judge_service._wrap_java_code(already_has_main)
check("Code with main() is returned unchanged", wrapped_main == already_has_main)


# ═════════════════════════════════════════════════════════════════════════════
# Section C: run_test_cases with mocked HTTP
# ═════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("Section C: run_test_cases — correct solution")
print("=" * 60)

test_cases_vowels = [
    {"input": "Hello World",  "expected_output": "3"},
    {"input": "AEIOUaeiou",   "expected_output": "10"},
    {"input": "",             "expected_output": "0"},
]

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    ctx.post.return_value  = _accepted_submission_response()
    ctx.get.side_effect = [
        _accepted_poll_response("3"),
        _accepted_poll_response("10"),
        _accepted_poll_response("0"),
    ]

    r = judge_service.run_test_cases("python", "def solution(s): return sum(c in 'AEIOUaeiou' for c in s)", test_cases_vowels)

check("Correct solution: execution_error=False",  r["execution_error"] is False)
check("Correct solution: 3/3 passed",             r["tests_passed"] == 3, str(r["tests_passed"]))
check("Correct solution: no error_message",       r["error_message"] is None)
check("Correct solution: all results passed=True",
      all(res["passed"] is True for res in r["results"]))


print("\n" + "=" * 60)
print("Section D: run_test_cases — 401 from Judge0 (THE CRITICAL TEST)")
print("=" * 60)

import httpx

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    # Simulate 401 on POST /submissions
    bad_resp = _mock_response(401, {"error": "Unauthorized"})
    ctx.post.side_effect = httpx.HTTPStatusError(
        "HTTP 401", request=MagicMock(), response=bad_resp
    )

    r_401_tc = judge_service.run_test_cases(
        "java",
        count_vowels_java,
        test_cases_vowels,
    )

check("401: execution_error=True",            r_401_tc["execution_error"] is True,
      f"got: {r_401_tc['execution_error']}")
check("401: tests_passed stays 0 (not penalty)", r_401_tc["tests_passed"] == 0)
check("401: results have passed=None (not False)",
      all(res["passed"] is None for res in r_401_tc["results"]),
      str([res["passed"] for res in r_401_tc["results"]]))
check("401: error_code is AUTHENTICATION_ERROR",
      r_401_tc.get("error_code") == "AUTHENTICATION_ERROR" or
      any("AUTHENTICATION" in (res.get("status") or "") for res in r_401_tc["results"]))

# CRITICAL: 401 must NEVER give passed=False (that would mark correct code as Wrong Answer)
any_false = any(res["passed"] is False for res in r_401_tc["results"])
check("CRITICAL: 401 never sets passed=False",  not any_false,
      f"VIOLATION: some test has passed=False despite 401 error")


print("\n" + "=" * 60)
print("Section E: run_test_cases — 429 rate limit")
print("=" * 60)

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    bad_resp = _mock_response(429, {"error": "Too Many Requests"})
    ctx.post.side_effect = httpx.HTTPStatusError(
        "HTTP 429", request=MagicMock(), response=bad_resp
    )
    r_429_tc = judge_service.run_test_cases("python", "pass", test_cases_vowels[:1])

check("429: execution_error=True",  r_429_tc["execution_error"] is True)
check("429: passed=None (not False)",
      all(res["passed"] is None for res in r_429_tc["results"]))


print("\n" + "=" * 60)
print("Section F: run_test_cases — 500 service error")
print("=" * 60)

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    bad_resp = _mock_response(500, {"error": "Internal Server Error"})
    ctx.post.side_effect = httpx.HTTPStatusError(
        "HTTP 500", request=MagicMock(), response=bad_resp
    )
    r_500_tc = judge_service.run_test_cases("python", "pass", test_cases_vowels[:1])

check("500: execution_error=True",  r_500_tc["execution_error"] is True)
check("500: passed=None (not False)",
      all(res["passed"] is None for res in r_500_tc["results"]))


print("\n" + "=" * 60)
print("Section G: run_test_cases — Wrong Answer (real)")
print("=" * 60)

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    ctx.post.return_value = _accepted_submission_response()
    ctx.get.return_value  = _wrong_answer_poll_response("99")  # wrong output

    r_wa = judge_service.run_test_cases(
        "python",
        "def solution(s): return 99",
        [{"input": "Hello World", "expected_output": "3"}],
    )

check("Wrong answer: execution_error=False",  r_wa["execution_error"] is False)
check("Wrong answer: passed=False",           r_wa["results"][0]["passed"] is False)
check("Wrong answer: tests_passed=0",         r_wa["tests_passed"] == 0)


print("\n" + "=" * 60)
print("Section H: run_test_cases — Compilation Error")
print("=" * 60)

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    ctx.post.return_value = _accepted_submission_response()
    ctx.get.return_value  = _compilation_error_poll_response()

    r_ce = judge_service.run_test_cases(
        "java",
        "class Solution { invalid syntax here }",
        [{"input": "hello", "expected_output": "2"}],
    )

check("Compilation error: execution_error=False", r_ce["execution_error"] is False,
      "(compilation errors are real user errors, not service errors)")
check("Compilation error: status contains 'Compilation'",
      "Compilation" in r_ce["results"][0]["status"],
      r_ce["results"][0]["status"])
check("Compilation error: passed=False",          r_ce["results"][0]["passed"] is False)


print("\n" + "=" * 60)
print("Section I: run_test_cases — Runtime Error")
print("=" * 60)

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    ctx.post.return_value = _accepted_submission_response()
    ctx.get.return_value  = _runtime_error_poll_response()

    r_re = judge_service.run_test_cases(
        "java",
        "class Solution { public int solution(String s) { throw new RuntimeException(); } }",
        [{"input": "hello", "expected_output": "2"}],
    )

check("Runtime error: execution_error=False", r_re["execution_error"] is False)
check("Runtime error: passed=False",          r_re["results"][0]["passed"] is False)


print("\n" + "=" * 60)
print("Section J: run_test_cases — Time Limit Exceeded")
print("=" * 60)

with patch("httpx.Client") as mock_client_cls:
    ctx = MagicMock()
    mock_client_cls.return_value.__enter__.return_value = ctx
    ctx.post.return_value = _accepted_submission_response()
    ctx.get.return_value  = _tle_poll_response()

    r_tle = judge_service.run_test_cases(
        "python",
        "def solution(s):\n  while True: pass",
        [{"input": "hello", "expected_output": "2"}],
    )

check("TLE: execution_error=False",  r_tle["execution_error"] is False)
check("TLE: passed=False",           r_tle["results"][0]["passed"] is False)
check("TLE: status='Time Limit Exceeded'",
      r_tle["results"][0]["status"] == "Time Limit Exceeded",
      r_tle["results"][0]["status"])


print("\n" + "=" * 60)
print("Section K: empty test cases")
print("=" * 60)

r_empty = judge_service.run_test_cases("python", "pass", [])
check("Empty test cases: execution_error=False",  r_empty["execution_error"] is False)
check("Empty test cases: tests_passed=0",         r_empty["tests_passed"] == 0)
check("Empty test cases: tests_total=0",          r_empty["tests_total"] == 0)
check("Empty test cases: results=[]",             r_empty["results"] == [])


print("\n" + "=" * 60)
print("Section L: URL selection")
print("=" * 60)

from unittest.mock import patch as upatch
with upatch.object(judge_service.settings, "JUDGE0_API_KEY", ""):
    url = judge_service._base_url()
check("No key → free CE endpoint (ce.judge0.com)",
      "ce.judge0.com" in url, url)

with upatch.object(judge_service.settings, "JUDGE0_API_KEY", "my-rapidapi-key"):
    url_rapid = judge_service._base_url()
    headers   = judge_service._headers()
check("With key → RapidAPI endpoint",
      "rapidapi.com" in url_rapid, url_rapid)
check("With key → X-RapidAPI-Key header set",
      headers.get("X-RapidAPI-Key") == "my-rapidapi-key")
check("With key → X-RapidAPI-Host header set",
      "X-RapidAPI-Host" in headers)

with upatch.object(judge_service.settings, "JUDGE0_API_KEY", ""):
    headers_no_key = judge_service._headers()
check("No key → no X-RapidAPI-Key header",
      "X-RapidAPI-Key" not in headers_no_key)
check("No key → no X-RapidAPI-Host header",
      "X-RapidAPI-Host" not in headers_no_key)


# ═════════════════════════════════════════════════════════════════════════════
# Section M: Evaluate code solution with execution_error
# ═════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("Section M: evaluate_code_solution with execution_error=True")
print("=" * 60)

from app.services.agents.evaluation_agent import evaluate_code_solution

problem_stub = {
    "title": "Count Vowels",
    "description": "Count vowels in a string.",
}

exec_error_judge_result = {
    "tests_passed": 0,
    "tests_total": 3,
    "execution_error": True,
    "error_code": "AUTHENTICATION_ERROR",
    "error_message": "The code execution provider rejected the request (authentication failed).",
    "results": [],
}

eval_result = evaluate_code_solution(
    problem=problem_stub,
    code=count_vowels_java,
    language="java",
    judge0_result=exec_error_judge_result,
)

check("execution_error eval: execution_service_error=True",
      eval_result.get("execution_service_error") is True)
check("execution_error eval: overall_score is NOT 0 (neutral 50)",
      eval_result.get("overall_score", 0) >= 40,
      str(eval_result.get("overall_score")))
check("execution_error eval: correctness_score is None (not 0%)",
      eval_result.get("correctness_score") is None,
      str(eval_result.get("correctness_score")))
check("execution_error eval: feedback mentions service error",
      "error" in eval_result.get("feedback", "").lower() or
      "service" in eval_result.get("feedback", "").lower())


# ═════════════════════════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════════════════════════

total  = len(results)
passed = sum(results)
failed = total - passed

print("\n" + "=" * 60)
print(f"Results: {passed}/{total} passed" + (f"  ({failed} FAILED)" if failed else "  — ALL OK ✓"))
print("=" * 60)

if failed:
    sys.exit(1)
