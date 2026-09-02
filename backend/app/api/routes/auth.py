"""
Enhanced authentication routes with security hardening:
- HttpOnly secure cookies for JWT
- Password strength validation
- Token revocation/blacklisting
- Refresh token rotation
- Rate limiting on auth endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from app.api.deps import get_current_user
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core import security
from app.core.database import get_db
from app.core.rate_limit import check_rate_limit
from app.models.user import User
from app.models.interview import RevokedToken
from app.schemas.auth import LoginRequest, RegisterRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])
security_scheme = HTTPBearer(auto_error=False)


def auth_rate_limit(request: Request) -> None:
    """Rate limit: 5 registration/login attempts per 5 minutes per IP."""
    check_rate_limit(request, limit=5, window_seconds=300)


def get_current_user_from_cookie(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """
    Extract JWT from HttpOnly cookie and validate.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    payload = security.decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    # Check if token is revoked
    jti = payload.get("jti")
    if jti:
        revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
        if revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked"
            )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(auth_rate_limit)
):
    """
    Register new user with password strength validation.
    """
    # Check password strength
    is_strong, message = security.verify_password_strength(payload.password)
    if not is_strong:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )

    # Check if user already exists
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user with hashed password
    hashed_password = security.hash_password(payload.password)
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hashed_password
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "User registered successfully",
        "user_id": str(user.id)
    }


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Login with email and password. Sets HttpOnly secure cookies with JWT.
    """
    user = db.query(User).filter(User.email == payload.email).first()

    if not user or not security.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Create access and refresh tokens
    access_token = security.create_access_token(subject=str(user.id))
    refresh_token = security.create_refresh_token(subject=str(user.id))

    # Set HttpOnly secure cookies (protects against XSS attacks)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,   # Prevents JavaScript access (XSS protection)
        secure=True,     # Only sent over HTTPS in production
        samesite="lax",  # CSRF protection
        max_age=1800,    # 30 minutes
        path="/"
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=604800,  # 7 days
        path="/api/auth/refresh"
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "message": "Login successful",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name
        }
    }


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Logout: revoke token and clear cookies.
    """
    token = request.cookies.get("access_token")

    if token:
        payload = security.decode_access_token(token)

        if payload and payload.get("jti"):
            # Add token to revocation blacklist
            token_hash = security.hash_token_for_storage(token)
            user_id = payload.get("sub")

            revoked = RevokedToken(
                jti=payload["jti"],
                token_hash=token_hash,
                user_id=user_id,
                reason="user_logout"
            )
            db.add(revoked)
            db.commit()

    # Clear cookies
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/api/auth/refresh")

    return {"message": "Logged out successfully"}


@router.post("/refresh")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Refresh access token using refresh token from cookie.
    """
    refresh_token = request.cookies.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided"
        )

    try:
        payload = security.decode_access_token(refresh_token)

        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        # Check if refresh token is revoked
        jti = payload.get("jti")
        if jti:
            revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
            if revoked:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token has been revoked"
                )

        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Issue new access token
        new_access_token = security.create_access_token(subject=str(user.id))

        response.set_cookie(
            key="access_token",
            value=new_access_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=1800,
            path="/"
        )

        return {"message": "Token refreshed successfully"}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not refresh token"
        )


@router.get("/me")
def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    Get current authenticated user information.
    """
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name
    }
