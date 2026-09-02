/**
 * useVoiceInterview — low-latency voice state machine
 *
 * Architecture overview
 * ─────────────────────
 *
 *  ┌─ TTS path ──────────────────────────────────────────────────────────┐
 *  │  prefetchTTS(text)          → fires fetch in background, caches    │
 *  │                                Promise<Blob>                       │
 *  │  playQuestion(text)         → if cached: awaits resolved blob       │
 *  │                               if not:   streams via MediaSource    │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ STT path ───────────────────────────────────────────────────────────┐
 *  │  startRecording()           → opens mic, runs MediaRecorder         │
 *  │  stopAndTranscribe()        → stops recorder, POSTs blob to /stt,  │
 *  │                               returns transcript string             │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ Pre-fetch strategy ─────────────────────────────────────────────────┐
 *  │  Call prefetchTTS() the instant the evaluation response returns     │
 *  │  next_question.  By the time React re-renders and the useEffect     │
 *  │  fires, the TTS blob is either fully ready or nearly so — the audio │
 *  │  starts with near-zero additional wait.                             │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ Streaming (first / uncached question) ──────────────────────────────┐
 *  │  Uses the Fetch API + MediaSource Extensions (MSE) to pipe chunks   │
 *  │  into an <audio> element as they arrive.  Playback starts after     │
 *  │  ~500 ms of buffering rather than waiting for the full MP3.         │
 *  │  Falls back to full-buffer-then-play on browsers without MSE/mpeg   │
 *  │  support (Safari < 15.4).                                           │
 *  └─────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import type { VoiceState } from "@/types";

// ── Browser capability detection ─────────────────────────────────────────────

/** True when the browser can stream audio/mpeg via MediaSource. */
const MSE_MP3 = (() => {
  try {
    return (
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported("audio/mpeg")
    );
  } catch {
    return false;
  }
})();

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseVoiceInterviewReturn {
  voiceState: VoiceState;
  voiceError: string | null;
  /** Speaks the question.  Checks pre-fetch cache first; streams if uncached. */
  playQuestion: (questionText: string) => Promise<void>;
  /** Opens the microphone and begins recording. */
  startRecording: () => Promise<void>;
  /** Stops recording, transcribes audio, returns transcript string. */
  stopAndTranscribe: () => Promise<string>;
  /**
   * Fire-and-forget: starts fetching TTS for *questionText* in the
   * background and caches the Promise.  Call this as soon as you know
   * what the next question will be.
   */
  prefetchTTS: (questionText: string) => void;
  /** Stops all audio/recording and resets to idle. */
  reset: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceInterview(sessionId: string | undefined): UseVoiceInterviewReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Audio playback
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null); // object URL currently in use

  // Recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Pre-fetch cache: question text → Promise<Blob>
  // Lives for the lifetime of the session component — survives question changes.
  const ttsCacheRef = useRef<Map<string, Promise<Blob>>>(new Map());

  // ── Internal: auth header ────────────────────────────────────────────────

  const authHeader = (): string =>
    `Bearer ${useAuthStore.getState().token ?? ""}`;

  // ── Internal: audio teardown ─────────────────────────────────────────────

  const stopCurrentAudio = useCallback(() => {
    const audio = audioElRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      audioElRef.current = null;
    }
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
  }, []);

  // ── Internal: recorder teardown ──────────────────────────────────────────

  const stopCurrentRecorder = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    rec?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── Internal: fetch helpers ──────────────────────────────────────────────

  /**
   * Starts a fetch to the TTS endpoint.  Returns the raw Response so the
   * caller can choose to stream it (MediaSource) or buffer it (blob).
   */
  const startTTSFetch = useCallback(
    (questionText: string): Promise<Response> =>
      fetch(`${API_BASE}/api/interviews/${sessionId}/tts`, {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question_text: questionText, voice: "alloy" }),
      }).then((res) => {
        if (!res.ok) throw new Error(`TTS request failed (${res.status})`);
        return res;
      }),
    [sessionId],
  );

  /** Fetches the full TTS blob — used by the pre-fetch cache. */
  const fetchTTSBlob = useCallback(
    (questionText: string): Promise<Blob> =>
      startTTSFetch(questionText).then((r) => r.blob()),
    [startTTSFetch],
  );

  // ── Internal: play a Blob that is already in memory ─────────────────────

  const playBlob = useCallback(
    (blob: Blob): Promise<void> => {
      stopCurrentAudio();
      const url = URL.createObjectURL(blob);
      activeUrlRef.current = url;

      return new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioElRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          activeUrlRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          activeUrlRef.current = null;
          reject(new Error("Audio playback failed."));
        };
        audio.play().catch(reject);
      });
    },
    [stopCurrentAudio],
  );

  // ── Internal: MSE streaming playback ────────────────────────────────────

  /**
   * Streams a TTS response directly into an HTMLAudioElement via MSE.
   * Audio starts playing after the first `canplay` event (~500 ms),
   * long before the full MP3 is received.
   *
   * Falls back to full-blob play if the browser doesn't support audio/mpeg MSE.
   */
  const playStreaming = useCallback(
    async (questionText: string): Promise<void> => {
      const response = await startTTSFetch(questionText);

      if (!MSE_MP3 || !response.body) {
        // MSE not available — buffer the full blob then play.
        const blob = await response.blob();
        // Cache for potential re-plays.
        ttsCacheRef.current.set(questionText, Promise.resolve(blob));
        return playBlob(blob);
      }

      stopCurrentAudio();

      const ms = new MediaSource();
      const msUrl = URL.createObjectURL(ms);
      activeUrlRef.current = msUrl;

      const audio = new Audio();
      audioElRef.current = audio;
      audio.src = msUrl;

      const reader = response.body.getReader();

      return new Promise<void>((resolve, reject) => {
        let sb: SourceBuffer;
        // Pending chunks that arrived before the sourceBuffer was ready.
        const queue: Uint8Array[] = [];
        let streamDone = false;
        let started = false;

        const tryPlay = () => {
          if (started || audio.readyState < 2 /* HAVE_CURRENT_DATA */) return;
          started = true;
          audio.play().catch(reject);
        };

        const flush = () => {
          if (!sb || sb.updating || queue.length === 0) return;
          sb.appendBuffer(queue.shift()!.buffer as ArrayBuffer);
        };

        const tryEndStream = () => {
          if (streamDone && !sb.updating && queue.length === 0) {
            try { ms.endOfStream(); } catch { /* already ended */ }
          }
        };

        // Continuously read chunks from the fetch stream.
        const pump = async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) {
                streamDone = true;
                tryEndStream();
                return;
              }
              queue.push(value);
              flush();
              tryPlay();
            }
          } catch (e) {
            reject(e);
          }
        };

        ms.addEventListener("sourceopen", () => {
          try {
            sb = ms.addSourceBuffer("audio/mpeg");
            sb.addEventListener("updateend", () => {
              flush();
              tryEndStream();
              tryPlay();
            });
            pump();
          } catch (e) {
            reject(e);
          }
        });

        audio.addEventListener("canplay", tryPlay, { once: true });

        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(msUrl);
          activeUrlRef.current = null;
          resolve();
        });

        audio.addEventListener("error", () => {
          URL.revokeObjectURL(msUrl);
          activeUrlRef.current = null;
          reject(new Error("Audio playback error."));
        });
      });
    },
    [startTTSFetch, playBlob, stopCurrentAudio],
  );

  // ── Public: prefetchTTS ──────────────────────────────────────────────────

  /**
   * Fire-and-forget pre-fetch.  Call this as soon as you know what the next
   * question will be (e.g., the instant the `/answer` response arrives).
   * The blob will be ready — or nearly so — by the time playQuestion() is
   * called, eliminating the TTS wait entirely for all questions after the first.
   */
  const prefetchTTS = useCallback(
    (questionText: string) => {
      if (!sessionId || !questionText.trim()) return;
      if (ttsCacheRef.current.has(questionText)) return; // already cached
      ttsCacheRef.current.set(questionText, fetchTTSBlob(questionText));
    },
    [sessionId, fetchTTSBlob],
  );

  // ── Public: playQuestion ─────────────────────────────────────────────────

  const playQuestion = useCallback(
    async (questionText: string): Promise<void> => {
      if (!sessionId) return;
      setVoiceError(null);
      setVoiceState("speaking");

      try {
        const cached = ttsCacheRef.current.get(questionText);
        if (cached) {
          // Pre-fetched blob is in flight or already resolved.
          // Awaiting a resolved promise is instant; an in-flight one waits the
          // remaining download time only.
          try {
            const blob = await cached;
            await playBlob(blob);
            return;
          } catch {
            // Cache miss due to network error — remove and fall through to stream.
            ttsCacheRef.current.delete(questionText);
          }
        }
        // No cache — stream directly (first question, or after cache error).
        await playStreaming(questionText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "TTS playback failed.";
        setVoiceError(msg);
        throw err;
      } finally {
        setVoiceState("idle");
      }
    },
    [sessionId, playBlob, playStreaming],
  );

  // ── Public: startRecording ───────────────────────────────────────────────

  const startRecording = useCallback(async (): Promise<void> => {
    setVoiceError(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      const msg = "Microphone access denied. Please allow microphone access and try again.";
      setVoiceError(msg);
      throw new Error(msg);
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(250); // 250 ms chunks — reliable across browsers
    setVoiceState("listening");
  }, []);

  // ── Public: stopAndTranscribe ────────────────────────────────────────────

  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    if (!sessionId) return "";
    setVoiceState("processing");
    setVoiceError(null);

    // Finalise the recording.
    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return reject(new Error("No active recording."));

      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };

      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      }
    });

    // Upload via native fetch (no axios overhead for binary data).
    try {
      const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", audioBlob, `recording.${ext}`);

      const res = await fetch(`${API_BASE}/api/interviews/${sessionId}/stt`, {
        method: "POST",
        headers: { Authorization: authHeader() },
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `STT failed (${res.status})`);
      }

      const { transcript } = (await res.json()) as { transcript: string };
      return transcript;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed.";
      setVoiceError(msg);
      throw new Error(msg);
    } finally {
      setVoiceState("idle");
    }
  }, [sessionId]);

  // ── Public: reset ────────────────────────────────────────────────────────

  /** Stops audio/recording. Does NOT clear the TTS pre-fetch cache. */
  const reset = useCallback(() => {
    stopCurrentAudio();
    stopCurrentRecorder();
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setVoiceState("idle");
    setVoiceError(null);
  }, [stopCurrentAudio, stopCurrentRecorder]);

  return {
    voiceState,
    voiceError,
    playQuestion,
    startRecording,
    stopAndTranscribe,
    prefetchTTS,
    reset,
  };
}
