"""
Central application configuration.
All environment-dependent values are read here, once, via pydantic-settings.
Nothing else in the codebase should call os.environ directly.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: str = "development"
    SECRET_KEY: str = "insecure-dev-secret-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ALGORITHM: str = "HS256"

    DATABASE_URL: str = "postgresql+psycopg2://interviewos:interviewos@localhost:5432/interviewos"
    REDIS_URL: str = "redis://localhost:6379/0"

    LLM_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Optional GitHub personal access token (classic or fine-grained, read:user scope).
    # If set, GitHub API rate limit increases from 60 req/hr to 5 000 req/hr.
    GITHUB_TOKEN: str = ""

    FRONTEND_ORIGIN: str = "http://localhost:5173"

    MAX_INTERVIEW_QUESTIONS: int = 40

    # ── Company Research (web scraping) ──────────────────────────────────────
    # When True, DuckDuckGo is queried at session start to build company_intel.
    RESEARCH_ENABLED: bool = True
    RESEARCH_MAX_SOURCES: int = 5   # DuckDuckGo result pages to scrape

    # ── Judge0 Code Execution ─────────────────────────────────────────────────
    # Free public Judge0 CE API (no key, ~50 req/day/IP): https://ce.judge0.com
    # For RapidAPI (higher limits): set JUDGE0_API_KEY to your RapidAPI key
    # and JUDGE0_API_URL to https://judge0-ce.p.rapidapi.com
    JUDGE0_API_URL: str = "https://ce.judge0.com"
    JUDGE0_API_KEY: str = ""
    JUDGE0_API_HOST: str = "judge0-ce.p.rapidapi.com"  # used only when key is set


@lru_cache
def get_settings() -> Settings:
    return Settings()
