/**
 * VoiceControls
 *
 * The animated voice interaction panel that replaces the textarea during
 * a voice-to-voice interview session.  It renders different content based
 * on the current voiceState:
 *
 *   idle       → "Tap to Answer" button (tap = startRecording)
 *   speaking   → animated sound-wave + "Interviewer is speaking…" label
 *   listening  → pulsing mic ring + "Listening…" label + "Done" button
 *   processing → spinner + "Transcribing…" label
 *
 * The transcript preview is shown whenever a transcribed answer is available
 * so the candidate can see what was captured before it is submitted.
 */

import { Mic, MicOff, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { VoiceState } from "@/types";

interface VoiceControlsProps {
  voiceState: VoiceState;
  transcript: string;
  voiceError: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Five animated bars mimicking an audio equaliser. */
function SoundWave() {
  const heights = [28, 44, 36, 52, 32, 44, 28];
  return (
    <div className="flex items-center justify-center gap-1" aria-hidden>
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-accent-400"
          style={{ height: h }}
          animate={{ scaleY: [1, 1.6, 0.8, 1.4, 1] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/** Three concentric rings pulsing outward to signal active recording. */
function PulsingRings() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      {[1, 2, 3].map((n) => (
        <motion.span
          key={n}
          className="absolute rounded-full border border-red-400/50"
          style={{ width: 56 + n * 28, height: 56 + n * 28 }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: n * 0.4 }}
        />
      ))}
      {/* Centre mic icon */}
      <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40">
        <Mic className="h-6 w-6 text-red-400" />
      </div>
    </div>
  );
}

/** Simple spinning arc used during the "processing" state. */
function ProcessingSpinner() {
  return (
    <motion.div
      className="h-12 w-12 rounded-full border-2 border-accent-500/20 border-t-accent-400"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      aria-hidden
    />
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function VoiceControls({
  voiceState,
  transcript,
  voiceError,
  onStartRecording,
  onStopRecording,
}: VoiceControlsProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-6">

      {/* ── Dynamic centre panel ── */}
      <AnimatePresence mode="wait">

        {voiceState === "speaking" && (
          <motion.div
            key="speaking"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-500/15 border border-accent-500/30">
              <Volume2 className="h-7 w-7 text-accent-400" />
            </div>
            <SoundWave />
            <p className="text-sm font-medium text-accent-300 tracking-wide">
              Interviewer is speaking…
            </p>
          </motion.div>
        )}

        {voiceState === "listening" && (
          <motion.div
            key="listening"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-6"
          >
            <PulsingRings />
            <p className="text-sm font-medium text-red-400 tracking-wide animate-pulse">
              Listening… speak your answer
            </p>
            <button
              id="voice-stop-btn"
              onClick={onStopRecording}
              className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
            >
              <MicOff className="h-4 w-4" />
              Done — submit answer
            </button>
          </motion.div>
        )}

        {voiceState === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-4"
          >
            <ProcessingSpinner />
            <p className="text-sm font-medium text-slate-400 tracking-wide">
              Transcribing your answer…
            </p>
          </motion.div>
        )}

        {voiceState === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-4"
          >
            <button
              id="voice-start-btn"
              onClick={onStartRecording}
              className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-accent-500/40 bg-accent-500/10 transition hover:bg-accent-500/20"
              aria-label="Tap to answer"
            >
              <Mic className="h-7 w-7 text-accent-400 transition group-hover:scale-110" />
            </button>
            <p className="text-sm text-slate-400">Tap to answer</p>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Transcript preview ── */}
      <AnimatePresence>
        {transcript && voiceState === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-xl rounded-xl border border-accent-500/20 bg-accent-500/5 px-4 py-3"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-accent-400">
              Your answer (transcribed)
            </p>
            <p className="text-sm leading-relaxed text-slate-200">{transcript}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {voiceError && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-xl rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3"
          >
            <p className="text-xs text-red-400">{voiceError}</p>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
