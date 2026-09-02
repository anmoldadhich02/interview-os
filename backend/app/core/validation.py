"""
Input validation and sanitization utilities to prevent injection attacks.
"""
import re
from typing import Any
from fastapi import HTTPException, status


class InputValidator:
    """
    Centralized input validation to prevent injection attacks.
    """

    # Dangerous patterns that could indicate SQL injection
    SQL_INJECTION_PATTERNS = [
        r"(\bOR\b|\bAND\b).*=.*",
        r";\s*(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|EXEC)",
        r"UNION\s+SELECT",
        r"--",
        r"/\*.*\*/",
        r"xp_cmdshell",
        r"exec\s*\(",
    ]

    # Dangerous patterns for code execution
    CODE_INJECTION_PATTERNS = [
        r"__import__",
        r"eval\s*\(",
        r"exec\s*\(",
        r"compile\s*\(",
        r"os\.system",
        r"subprocess",
        r"open\s*\(",
    ]

    # Path traversal patterns
    PATH_TRAVERSAL_PATTERNS = [
        r"\.\./",
        r"\.\.\\",
        r"~\/",
        r"%2e%2e",
    ]

    @staticmethod
    def validate_email(email: str) -> str:
        """
        Validate email format.
        """
        email = email.strip().lower()
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

        if not re.match(pattern, email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email format"
            )

        if len(email) > 255:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email too long (max 255 characters)"
            )

        return email

    @staticmethod
    def validate_string(
        value: str,
        field_name: str,
        min_length: int = 1,
        max_length: int = 1000,
        allow_special_chars: bool = True
    ) -> str:
        """
        Validate and sanitize string inputs.
        """
        if not isinstance(value, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must be a string"
            )

        value = value.strip()

        if len(value) < min_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must be at least {min_length} characters"
            )

        if len(value) > max_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must not exceed {max_length} characters"
            )

        # Check for SQL injection patterns
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid characters detected in {field_name}"
                )

        # Check for path traversal
        for pattern in InputValidator.PATH_TRAVERSAL_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid path detected in {field_name}"
                )

        if not allow_special_chars:
            if not re.match(r"^[a-zA-Z0-9\s.,!?'-]+$", value):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field_name} contains invalid characters"
                )

        return value

    @staticmethod
    def validate_code_submission(code: str, language: str) -> str:
        """
        Validate code submissions to prevent malicious code execution.
        """
        if not isinstance(code, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code must be a string"
            )

        # Limit code size to prevent memory attacks
        max_code_length = 50000  # 50KB
        if len(code) > max_code_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Code exceeds maximum length of {max_code_length} characters"
            )

        # Check for dangerous patterns (basic check - Judge0 sandbox provides real isolation)
        dangerous_keywords = {
            "python": ["__import__", "eval(", "exec(", "compile(", "globals(", "locals("],
            "javascript": ["eval(", "Function(", "setTimeout(", "setInterval("],
            "cpp": ["system(", "exec(", "fork("],
            "java": ["Runtime.getRuntime", "ProcessBuilder"],
        }

        if language.lower() in dangerous_keywords:
            for keyword in dangerous_keywords[language.lower()]:
                if keyword in code:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Potentially dangerous code pattern detected: {keyword}"
                    )

        return code

    @staticmethod
    def sanitize_llm_prompt(user_input: str) -> str:
        """
        Sanitize user input before sending to LLM to prevent prompt injection.

        Common prompt injection patterns:
        - "Ignore previous instructions"
        - "You are now a different assistant"
        - "Disregard all prior context"
        """
        if not isinstance(user_input, str):
            return str(user_input)

        # Remove potential prompt injection attempts
        injection_patterns = [
            r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
            r"disregard\s+(all\s+)?(previous|prior|above)",
            r"you\s+are\s+now\s+(a|an)",
            r"forget\s+(everything|all|previous)",
            r"new\s+instructions?:",
            r"system\s+prompt:",
        ]

        sanitized = user_input
        for pattern in injection_patterns:
            sanitized = re.sub(pattern, "[REDACTED]", sanitized, flags=re.IGNORECASE)

        # Limit length to prevent token flooding
        max_length = 10000
        if len(sanitized) > max_length:
            sanitized = sanitized[:max_length] + "... [truncated]"

        return sanitized

    @staticmethod
    def validate_uuid(value: str, field_name: str) -> str:
        """
        Validate UUID format.
        """
        uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

        if not re.match(uuid_pattern, value, re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid {field_name} format"
            )

        return value.lower()

    @staticmethod
    def validate_integer(
        value: Any,
        field_name: str,
        min_value: int = None,
        max_value: int = None
    ) -> int:
        """
        Validate integer inputs with bounds checking.
        """
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must be an integer"
            )

        if min_value is not None and int_value < min_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must be at least {min_value}"
            )

        if max_value is not None and int_value > max_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must not exceed {max_value}"
            )

        return int_value


# Convenience functions
def validate_email(email: str) -> str:
    return InputValidator.validate_email(email)


def validate_string(
    value: str,
    field_name: str,
    min_length: int = 1,
    max_length: int = 1000,
    allow_special_chars: bool = True
) -> str:
    return InputValidator.validate_string(value, field_name, min_length, max_length, allow_special_chars)


def validate_code(code: str, language: str) -> str:
    return InputValidator.validate_code_submission(code, language)


def sanitize_for_llm(text: str) -> str:
    return InputValidator.sanitize_llm_prompt(text)
