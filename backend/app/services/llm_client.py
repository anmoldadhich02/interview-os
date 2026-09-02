"""
Provider-agnostic LLM client.

Every agent talks to this single interface, never to the OpenAI SDK
directly. To add a new provider, implement LLMClient and wire it up in
get_llm_client() based on settings.LLM_PROVIDER.
"""
import json
from abc import ABC, abstractmethod

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings

settings = get_settings()


class LLMClient(ABC):
    @abstractmethod
    def complete_json(self, system_prompt: str, user_prompt: str) -> dict:
        """Call the model and return a parsed JSON dict. The system prompt
        must instruct the model to return ONLY valid JSON."""

    @abstractmethod
    def complete_text(self, system_prompt: str, user_prompt: str) -> str:
        """Call the model and return plain text."""


class OpenAIClient(LLMClient):
    def __init__(self) -> None:
        if not settings.OPENAI_API_KEY:
            self._client = None
        else:
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.OPENAI_MODEL

    def _require_client(self) -> OpenAI:
        if self._client is None:
            raise RuntimeError(
                "OPENAI_API_KEY is not configured. Set it in backend/.env "
                "to enable AI-generated interviews."
            )
        return self._client

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    def complete_json(self, system_prompt: str, user_prompt: str) -> dict:
        client = self._require_client()
        response = client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    def complete_text(self, system_prompt: str, user_prompt: str) -> str:
        client = self._require_client()
        response = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
        )
        return response.choices[0].message.content or ""


_client_singleton: LLMClient | None = None


def get_llm_client() -> LLMClient:
    global _client_singleton
    if _client_singleton is None:
        if settings.LLM_PROVIDER == "openai":
            _client_singleton = OpenAIClient()
        else:
            raise ValueError(f"Unsupported LLM_PROVIDER: {settings.LLM_PROVIDER}")
    return _client_singleton
