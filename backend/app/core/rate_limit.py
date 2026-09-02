"""
Asynchronous sliding window rate limiting for FastAPI.
Provides in-memory rate limiting with customizable windows and thresholds.
"""
from fastapi import Request, HTTPException, status
import time
from collections import defaultdict
from typing import Dict, List

class RateLimiter:
    def __init__(self):
        # Maps IP address -> list of request timestamps
        self.requests: Dict[str, List[float]] = defaultdict(list)

    def is_rate_limited(self, ip: str, limit: int, window_seconds: int) -> bool:
        """
        Check if an IP has exceeded the rate limit.
        Cleans up expired timestamps before registering the current command.
        """
        current_time = time.time()
        window_start = current_time - window_seconds

        # Get request history for this IP
        history = self.requests[ip]

        # Evict timestamps older than the active window
        history = [ts for ts in history if ts > window_start]
        self.requests[ip] = history

        # Check threshold
        if len(history) >= limit:
            return True

        # Log current request
        self.requests[ip].append(current_time)
        return False

# Global Limiter Instance
limiter = RateLimiter()

def check_rate_limit(
    request: Request,
    limit: int = 60,
    window_seconds: int = 60
):
    """
    Dependency helper to rate limit routes.
    Defaults to 60 requests per minute per IP.
    """
    # Fallback to local socket if proxy header is missing
    ip = request.headers.get("X-Forwarded-For") or request.client.host if request.client else "unknown"

    if limiter.is_rate_limited(ip, limit, window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later."
        )
