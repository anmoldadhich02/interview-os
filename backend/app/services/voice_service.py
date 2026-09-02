"""
Voice Service.

Provides wrappers around the OpenAI Audio API:

  Sync (backward-compat, kept for any direct callers):
    text_to_speech  : question text → raw MP3 bytes (buffers full response)
    speech_to_text  : audio bytes  → transcript string

  Async (used by the voice API routes for non-blocking I/O):
    stream_tts      : async generator — yields MP3 chunks as they arrive from
                      OpenAI (~200-400 ms to first chunk), enabling MediaSource
                      streaming on the frontend.
    stt_async       : non-blocking Whisper transcription — does not occupy a
                      thread pool slot during the OpenAI round-trip.

All functions use the same OPENAI_API_KEY wired for the LLM agents.
"""
import io
from typing import AsyncGenerator

from openai import AsyncOpenAI, OpenAI

from app.core.config import get_settings

settings = get_settings()


# ── Client factories ──────────────────────────────────────────────────────────

def _sync_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Set it in backend/.env to enable voice features."
        )
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _async_client() -> AsyncOpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Set it in backend/.env to enable voice features."
        )
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ── Synchronous API (backward-compat) ─────────────────────────────────────────

def text_to_speech(text: str, voice: str = "alloy") -> bytes:
    """
    Convert *text* to speech and return raw MP3 bytes (full buffer).

    Args:
        text:  Question text to speak (max ~4 096 tokens for tts-1).
        voice: alloy | echo | fable | onyx | nova | shimmer.
    """
    return _sync_client().audio.speech.create(
        model="tts-1",
        voice=voice,  # type: ignore[arg-type]
        input=text,
        response_format="mp3",
    ).content


def speech_to_text(audio_bytes: bytes, filename: str = "recording.webm") -> str:
    """Transcribe *audio_bytes* with Whisper and return the plain-text transcript."""
    f = io.BytesIO(audio_bytes)
    f.name = filename  # type: ignore[attr-defined]
    return (
        _sync_client().audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text",
        ) or ""
    ).strip()


# ── Async API (used by the voice routes) ─────────────────────────────────────

async def stream_tts(text: str, voice: str = "alloy") -> AsyncGenerator[bytes, None]:
    """
    Async generator that yields raw MP3 chunks as they stream from OpenAI.

    The first chunk typically arrives in ~200-400 ms — far sooner than the
    full audio would be ready.  FastAPI's StreamingResponse pipes these
    chunks directly to the browser, which can start MSE playback immediately.

    Chunk size of 1 024 bytes gives a good balance:
      - Small enough to start playback quickly.
      - Large enough to amortise HTTP chunked-encoding overhead.
    """
    client = _async_client()
    async with client.audio.speech.with_streaming_response.create(
        model="tts-1",
        voice=voice,  # type: ignore[arg-type]
        input=text,
        response_format="mp3",
    ) as response:
        async for chunk in response.iter_bytes(chunk_size=1024):
            yield chunk


async def stt_async(audio_bytes: bytes, filename: str = "recording.webm") -> str:
    """
    Async Whisper transcription.

    Unlike the sync version, this does not occupy a uvicorn thread-pool
    slot during the OpenAI round-trip — other requests can be served
    concurrently while this awaits.
    """
    f = io.BytesIO(audio_bytes)
    f.name = filename  # type: ignore[attr-defined]
    transcription = await _async_client().audio.transcriptions.create(
        model="whisper-1",
        file=f,
        response_format="text",
    )
    return (transcription or "").strip()
