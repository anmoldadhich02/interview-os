"""
Enhanced password hashing and JWT issuance/verification with security hardening.
"""
from datetime import datetime, timedelta, timezone
from typing import Any
import secrets
import hashlib

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()

# Use bcrypt with increased cost factor for stronger hashing
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Increased from default 10 for better security
)


def hash_password(password: str) -> str:
    """Hash password with bcrypt (cost factor 12)."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against bcrypt hash."""
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    """
    Create JWT access token with enhanced security:
    - Shorter expiration (30 min)
    - JTI (JWT ID) for token revocation tracking
    - Issued at timestamp
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # Generate unique JWT ID for token revocation capability
    jti = secrets.token_urlsafe(32)

    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),  # Issued at timestamp
        "jti": jti,  # JWT ID for revocation tracking
        "type": "access"
    }

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """
    Create long-lived refresh token (7 days) for token rotation.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    jti = secrets.token_urlsafe(32)

    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": jti,
        "type": "refresh"
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """
    Decode and validate JWT token with security checks.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        # Verify token type
        if payload.get("type") != "access":
            return None

        # Verify expiration
        exp = payload.get("exp")
        if not exp or datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
            return None

        return payload
    except JWTError:
        return None


def generate_password_reset_token(email: str) -> str:
    """
    Generate secure password reset token (1 hour expiry).
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    jti = secrets.token_urlsafe(32)

    payload = {
        "sub": email,
        "exp": expire,
        "jti": jti,
        "type": "password_reset"
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_password_strength(password: str) -> tuple[bool, str]:
    """
    Enforce password strength requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"

    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"

    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit"

    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        return False, "Password must contain at least one special character"

    return True, "Password is strong"


def hash_token_for_storage(token: str) -> str:
    """
    Hash tokens before storing in database (e.g., for token revocation list).
    Uses SHA-256 for fast lookups.
    """
    return hashlib.sha256(token.encode()).hexdigest()
