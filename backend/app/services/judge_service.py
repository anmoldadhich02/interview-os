"""
Judge0 Code Execution Service.

Supports two Judge0 endpoints (auto-selected based on credentials):

  1. Free CE endpoint (default): https://ce.judge0.com
     - No API key required
     - ~50 submissions/day/IP on free tier
     - Used automatically when JUDGE0_API_KEY is empty

  2. RapidAPI endpoint: https://judge0-ce.p.rapidapi.com
     - Requires JUDGE0_API_KEY (RapidAPI key)
     - Higher rate limits
     - Used when JUDGE0_API_KEY is set in .env

Supported languages: Python 3, C++, Java, JavaScript (Node), Go, Rust,
                     TypeScript, C, Ruby, Swift, Kotlin.

IMPORTANT: Execution-provider failures (401, 403, 429, 5xx, timeout) are
           propagated as { execution_error: True } and MUST NOT be treated
           as Wrong Answer in the evaluation layer.
"""
from __future__ import annotations

import base64
import logging
import re
import time
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Judge0 CE language IDs ────────────────────────────────────────────────────
LANGUAGE_IDS: dict[str, int] = {
    "python":     71,   # Python 3.8.1
    "python3":    71,
    "cpp":        54,   # C++ (GCC 9.2.0)
    "c++":        54,
    "java":       62,   # Java (OpenJDK 13.0.1)
    "javascript": 63,   # Node.js 12.14.0
    "js":         63,
    "go":         60,   # Go 1.13.5
    "golang":     60,
    "rust":       73,   # Rust 1.40.0
    "typescript": 74,   # TypeScript 3.7.4
    "ts":         74,
    "c":          50,   # C (GCC 9.2.0)
    "ruby":       72,   # Ruby 2.7.0
    "swift":      83,   # Swift 5.2.3
    "kotlin":     78,   # Kotlin 1.3.70
}

# ── Error classification ──────────────────────────────────────────────────────
ERROR_CODES = {
    "AUTHENTICATION_ERROR":   "The code execution provider rejected the request (authentication failed). "
                              "Please check the server's JUDGE0_API_KEY configuration.",
    "ACCESS_DENIED":          "The code execution provider denied access (403 Forbidden). "
                              "Please check that the API key has sufficient permissions.",
    "RATE_LIMIT_EXCEEDED":    "The code execution provider rate limit was exceeded (429). "
                              "Please wait a moment and try again.",
    "SERVICE_UNAVAILABLE":    "The code execution service is temporarily unavailable. "
                              "Please try again shortly.",
    "NETWORK_ERROR":          "Could not reach the code execution service. "
                              "Please check the network connection.",
    "POLLING_TIMEOUT":        "Code execution timed out while waiting for a result. "
                              "Your code may contain an infinite loop or take too long.",
    "EXECUTION_SERVICE_ERROR": "The code execution service encountered an unexpected error.",
}

_TIMEOUT = 30.0
_POLL_INTERVAL = 1.5
_MAX_POLLS = 15


# ── URL / header helpers ──────────────────────────────────────────────────────

def _use_rapidapi() -> bool:
    """True when a RapidAPI key is configured — use RapidAPI endpoint."""
    return bool(settings.JUDGE0_API_KEY)


def _base_url() -> str:
    if _use_rapidapi():
        return "https://judge0-ce.p.rapidapi.com"
    return settings.JUDGE0_API_URL.rstrip("/")


def _headers() -> dict[str, str]:
    h: dict[str, str] = {"Content-Type": "application/json"}
    if _use_rapidapi():
        h["X-RapidAPI-Host"] = settings.JUDGE0_API_HOST
        h["X-RapidAPI-Key"]  = settings.JUDGE0_API_KEY
    return h


def _resolve_language(language: str) -> int:
    lang_id = LANGUAGE_IDS.get(language.lower().strip())
    if lang_id is None:
        supported = sorted(set(LANGUAGE_IDS.keys()))
        raise ValueError(f"Unsupported language '{language}'. Supported: {supported}")
    return lang_id


def _b64_enc(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode()


def _b64_dec(val: Optional[str]) -> str:
    if not val:
        return ""
    try:
        return base64.b64decode(val).decode("utf-8", errors="replace")
    except Exception:
        return val


# ── Error classification ──────────────────────────────────────────────────────

def _classify_http_error(status_code: int) -> dict:
    """Map an HTTP error status code to a structured execution error dict."""
    if status_code == 401:
        code = "AUTHENTICATION_ERROR"
    elif status_code == 403:
        code = "ACCESS_DENIED"
    elif status_code == 429:
        code = "RATE_LIMIT_EXCEEDED"
    elif status_code >= 500:
        code = "SERVICE_UNAVAILABLE"
    else:
        code = "EXECUTION_SERVICE_ERROR"

    return {
        "execution_error": True,
        "error_code": code,
        "error_message": ERROR_CODES.get(code, ERROR_CODES["EXECUTION_SERVICE_ERROR"]),
        "http_status": status_code,
        "status": {"id": -1, "description": code},
        "stdout": None,
        "stderr": None,
        "compile_output": None,
        "time": None,
        "memory": None,
    }


# ── Java wrapper generation ───────────────────────────────────────────────────

# Matches: class Solution { public <ReturnType> <methodName>(<ParamType> <paramName>) { ... } }
_JAVA_METHOD_RE = re.compile(
    r"public\s+(\w+(?:\[\])?)\s+(\w+)\s*\(([^)]*)\)",
    re.MULTILINE,
)

_JAVA_DRIVER_TEMPLATE = """\
{solution_code}

public class Main {{
    public static void main(String[] args) throws Exception {{
        java.util.Scanner scanner = new java.util.Scanner(System.in);
        Solution sol = new Solution();
{parse_and_call}
        if (result != null) {{
            System.out.println(result);
        }} else {{
            System.out.println("");
        }}
    }}
}}
"""

# Per-type stdin parsing snippets
# Every snippet guards with hasNextLine() to avoid NoSuchElementException on empty stdin.
_JAVA_TYPE_PARSERS: dict[str, str] = {
    "String":    "String {name} = scanner.hasNextLine() ? scanner.nextLine() : \"\";",
    "int":       "int {name} = scanner.hasNextLine() ? Integer.parseInt(scanner.nextLine().trim()) : 0;",
    "long":      "long {name} = scanner.hasNextLine() ? Long.parseLong(scanner.nextLine().trim()) : 0L;",
    "double":    "double {name} = scanner.hasNextLine() ? Double.parseDouble(scanner.nextLine().trim()) : 0.0;",
    "boolean":   "boolean {name} = scanner.hasNextLine() ? Boolean.parseBoolean(scanner.nextLine().trim()) : false;",
    "char":      "char {name} = scanner.hasNextLine() ? scanner.nextLine().trim().charAt(0) : ' ';",
    "int[]":     "int[] {name} = new int[0];\n"
                 "        if (scanner.hasNextLine()) {{\n"
                 "            String[] {name}Tokens = scanner.nextLine().trim().split(\",|\\\\s+\");\n"
                 "            {name} = new int[{name}Tokens.length];\n"
                 "            for (int i = 0; i < {name}Tokens.length; i++) {{ {name}[i] = Integer.parseInt({name}Tokens[i].trim()); }}\n"
                 "        }}",
    "String[]":  "String[] {name} = scanner.hasNextLine() ? scanner.nextLine().trim().split(\",|\\\\s+\") : new String[0];",
}


def _wrap_java_code(source_code: str) -> str:
    """
    If the Java code is a bare 'class Solution { ... }' without a main method,
    wrap it with a driver class that reads stdin and calls the solution method.

    If the code already has a main method, return it unchanged.
    If we cannot determine the method signature, return unchanged (Judge0 will
    report the compilation error naturally).
    """
    if "public static void main" in source_code:
        return source_code  # already has a main — run as-is

    if "class Solution" not in source_code:
        return source_code  # not a Solution class pattern

    # Find the first public method in Solution
    match = _JAVA_METHOD_RE.search(source_code)
    if not match:
        logger.warning("Java wrap: could not detect method signature, submitting as-is")
        return source_code

    return_type = match.group(1)   # e.g. "int", "String", "int[]"
    method_name = match.group(2)   # e.g. "solution", "twoSum"
    params_str  = match.group(3).strip()  # e.g. "String s", "int[] nums, int target"

    # Parse parameter list
    params: list[tuple[str, str]] = []  # [(type, name), ...]
    if params_str:
        for p in params_str.split(","):
            parts = p.strip().split()
            if len(parts) >= 2:
                ptype = " ".join(parts[:-1])
                pname = parts[-1]
                params.append((ptype, pname))

    # Build stdin parsing + call lines
    parse_lines: list[str] = []
    arg_names: list[str] = []
    for ptype, pname in params:
        parser = _JAVA_TYPE_PARSERS.get(ptype)
        if parser:
            parse_lines.append("        " + parser.format(name=pname))
        else:
            # Unknown type — read as String and cast
            parse_lines.append(f"        String {pname}Raw = scanner.nextLine().trim();")
            pname = f"/* WARN: unknown type {ptype} */ {pname}Raw"
        arg_names.append(pname)

    call_expr = f"sol.{method_name}({', '.join(arg_names)})"

    # Build result printing
    if return_type == "int[]":
        print_result = (
            "        int[] resultArr = " + call_expr + ";\n"
            "        StringBuilder sb = new StringBuilder(\"[\");\n"
            "        for (int i = 0; i < resultArr.length; i++) {\n"
            "            if (i > 0) sb.append(\",\");\n"
            "            sb.append(resultArr[i]);\n"
            "        }\n"
            "        sb.append(\"]\");\n"
            "        String result = sb.toString();"
        )
    elif return_type == "String[]":
        print_result = (
            "        String[] resultArr = " + call_expr + ";\n"
            "        String result = String.join(\",\", resultArr);"
        )
    else:
        # For primitive types, box them to Object so the null-check in the template works.
        # We cast to Object to allow the single null-check in the driver template.
        print_result = f"        Object result = {call_expr};"

    parse_and_call = "\n".join(parse_lines) + "\n" + print_result

    wrapped = _JAVA_DRIVER_TEMPLATE.format(
        solution_code=source_code,
        parse_and_call=parse_and_call,
    )
    logger.debug("Java wrap: wrapped %s.%s(%s) -> %s", "Solution", method_name, params_str, return_type)
    return wrapped


def _prepare_source(language: str, source_code: str) -> str:
    """Apply any language-specific code transformations before submission."""
    if language.lower() in ("java",):
        return _wrap_java_code(source_code)
    return source_code


# ── Core submission / polling ─────────────────────────────────────────────────

def _submit_and_poll(lang_id: int, source_code: str, stdin: str = "") -> dict:
    """
    Submit source_code to Judge0 and poll until the result is ready.

    Returns a raw Judge0 response dict, ALWAYS including:
      - execution_error: bool
      - error_code: str | None
      - error_message: str | None
    Never raises — all errors are captured and returned as execution_error=True.
    """
    payload = {
        "language_id": lang_id,
        "source_code": _b64_enc(source_code),
        "stdin":        _b64_enc(stdin) if stdin else "",
        "base64_encoded": True,
        "wait": False,
    }

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            # --- submit ──────────────────────────────────────────────────────
            try:
                resp = client.post(
                    f"{_base_url()}/submissions",
                    json=payload,
                    headers=_headers(),
                    params={"base64_encoded": "true"},
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                logger.error("Judge0 submit HTTP %s: %s", exc.response.status_code, exc)
                return _classify_http_error(exc.response.status_code)
            except httpx.RequestError as exc:
                logger.error("Judge0 submit network error: %s", exc)
                return {
                    "execution_error": True,
                    "error_code": "NETWORK_ERROR",
                    "error_message": ERROR_CODES["NETWORK_ERROR"],
                    "status": {"id": -1, "description": "NETWORK_ERROR"},
                    "stdout": None, "stderr": None, "compile_output": None,
                    "time": None, "memory": None,
                }

            token = resp.json().get("token")
            if not token:
                logger.error("Judge0 did not return a submission token")
                return {
                    "execution_error": True,
                    "error_code": "EXECUTION_SERVICE_ERROR",
                    "error_message": "Code execution service did not return a submission token.",
                    "status": {"id": -1, "description": "EXECUTION_SERVICE_ERROR"},
                    "stdout": None, "stderr": None, "compile_output": None,
                    "time": None, "memory": None,
                }

            # --- poll ────────────────────────────────────────────────────────
            for _ in range(_MAX_POLLS):
                time.sleep(_POLL_INTERVAL)
                try:
                    status_resp = client.get(
                        f"{_base_url()}/submissions/{token}",
                        headers=_headers(),
                        params={
                            "base64_encoded": "true",
                            "fields": "stdout,stderr,compile_output,status,time,memory",
                        },
                    )
                    status_resp.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    logger.error("Judge0 poll HTTP %s: %s", exc.response.status_code, exc)
                    return _classify_http_error(exc.response.status_code)
                except httpx.RequestError as exc:
                    logger.error("Judge0 poll network error: %s", exc)
                    return {
                        "execution_error": True,
                        "error_code": "NETWORK_ERROR",
                        "error_message": ERROR_CODES["NETWORK_ERROR"],
                        "status": {"id": -1, "description": "NETWORK_ERROR"},
                        "stdout": None, "stderr": None, "compile_output": None,
                        "time": None, "memory": None,
                    }

                data = status_resp.json()
                data.setdefault("execution_error", False)
                data.setdefault("error_code", None)
                data.setdefault("error_message", None)

                # status.id 1 = In Queue, 2 = Processing — keep polling
                if data.get("status", {}).get("id", 0) not in (1, 2):
                    return data

            # Polling timed out
            logger.warning("Judge0 polling timed out after %d polls", _MAX_POLLS)
            return {
                "execution_error": True,
                "error_code": "POLLING_TIMEOUT",
                "error_message": ERROR_CODES["POLLING_TIMEOUT"],
                "status": {"id": -1, "description": "POLLING_TIMEOUT"},
                "stdout": None, "stderr": None, "compile_output": None,
                "time": None, "memory": None,
            }

    except Exception as exc:
        logger.exception("Judge0 unexpected error: %s", exc)
        return {
            "execution_error": True,
            "error_code": "EXECUTION_SERVICE_ERROR",
            "error_message": f"Unexpected execution service error: {exc}",
            "status": {"id": -1, "description": "EXECUTION_SERVICE_ERROR"},
            "stdout": None, "stderr": None, "compile_output": None,
            "time": None, "memory": None,
        }


def _to_run_result(raw: dict) -> dict:
    """Normalise a raw Judge0 response into a structured RunResult."""
    status = raw.get("status", {}).get("description", "Unknown")
    stdout = _b64_dec(raw.get("stdout"))
    stderr = _b64_dec(raw.get("stderr"))
    compile_err = _b64_dec(raw.get("compile_output"))
    return {
        "stdout": stdout,
        "stderr": stderr or compile_err or None,
        "compile_error": compile_err or None,
        "status": status,
        "time": raw.get("time"),
        "memory": raw.get("memory"),
        "execution_error": raw.get("execution_error", False),
        "error_code": raw.get("error_code"),
        "error_message": raw.get("error_message"),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def run_code(language: str, source_code: str, stdin: str = "") -> dict:
    """
    Run code with optional stdin — no test-case checking.
    Used for the frontend \"Run Code\" custom-stdin tab.

    Returns { stdout, stderr, compile_error, status, time, memory,
              execution_error, error_code, error_message }.
    """
    try:
        lang_id = _resolve_language(language)
    except ValueError as exc:
        return {
            "stdout": "",
            "stderr": str(exc),
            "compile_error": None,
            "status": "Error",
            "time": None,
            "memory": None,
            "execution_error": False,
            "error_code": None,
            "error_message": None,
        }

    prepared = _prepare_source(language, source_code)
    raw = _submit_and_poll(lang_id, prepared, stdin)
    return _to_run_result(raw)


def run_test_cases(language: str, source_code: str, test_cases: list[dict]) -> dict:
    """
    Run code against ALL provided test cases (public + hidden) for final Submit.

    Each test_case must have { \"input\": str, \"expected_output\": str }.
    Returns {
        tests_passed, tests_total, pass_rate, execution_error, error_message,
        results: [{ input, expected, actual, passed, status, stderr, time, execution_error }]
    }.

    CRITICAL: If execution_error=True on any test case, that test is NOT counted
    as passed=False. The entire result has execution_error=True and the evaluation
    layer MUST NOT penalise the submission for this.
    """
    if not test_cases:
        logger.warning("run_test_cases called with empty test_cases list")
        return {
            "tests_passed": 0,
            "tests_total": 0,
            "pass_rate": 0.0,
            "execution_error": False,
            "error_message": None,
            "results": [],
        }

    try:
        lang_id = _resolve_language(language)
    except ValueError as exc:
        return {
            "tests_passed": 0,
            "tests_total": len(test_cases),
            "pass_rate": 0.0,
            "execution_error": True,
            "error_code": "EXECUTION_SERVICE_ERROR",
            "error_message": str(exc),
            "results": [],
        }

    prepared = _prepare_source(language, source_code)
    results: list[dict] = []
    passed = 0
    any_execution_error = False
    first_error_message: Optional[str] = None

    for tc in test_cases:
        stdin    = tc.get("input", "")
        expected = tc.get("expected_output", "").strip()

        raw = _submit_and_poll(lang_id, prepared, stdin)
        exec_err = raw.get("execution_error", False)

        if exec_err:
            any_execution_error = True
            if first_error_message is None:
                first_error_message = raw.get("error_message", ERROR_CODES["EXECUTION_SERVICE_ERROR"])
            results.append({
                "input":          stdin[:300],
                "expected":       expected[:300],
                "actual":         "",
                "passed":         None,          # None = not evaluated (not False)
                "status":         raw.get("error_code", "EXECUTION_SERVICE_ERROR"),
                "stderr":         raw.get("error_message", "")[:300],
                "time":           None,
                "execution_error": True,
            })
        else:
            stdout  = _b64_dec(raw.get("stdout")).strip()
            stderr  = _b64_dec(raw.get("stderr")) or _b64_dec(raw.get("compile_output"))
            status  = raw.get("status", {}).get("description", "Unknown")

            ok = (
                stdout == expected
                and "error" not in status.lower()
                and status not in ("Time Limit Exceeded", "Memory Limit Exceeded")
            )
            if ok:
                passed += 1

            results.append({
                "input":           stdin[:300],
                "expected":        expected[:300],
                "actual":          stdout[:300],
                "passed":          ok,
                "status":          status,
                "stderr":          (stderr or "")[:300] if stderr else None,
                "time":            raw.get("time"),
                "execution_error": False,
            })

    # Denominator only counts non-errored tests for pass rate
    evaluated = sum(1 for r in results if r["passed"] is not None)
    pass_rate  = passed / evaluated if evaluated > 0 else 0.0

    return {
        "tests_passed":    passed,
        "tests_total":     len(test_cases),
        "evaluated_total": evaluated,
        "pass_rate":       pass_rate,
        "execution_error": any_execution_error,
        "error_message":   first_error_message,
        "results":         results,
    }


def run_public_tests(language: str, source_code: str, test_cases: list[dict]) -> dict:
    """
    Run code against PUBLIC test cases only (is_hidden=False).
    Used by POST /api/judge/run-tests (the frontend \"Run Code\" button).

    Caller is responsible for pre-filtering to public tests only.
    Returns the same structure as run_test_cases().
    """
    return run_test_cases(language, source_code, test_cases)
