import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck, UserX, Users } from "lucide-react";
import { initFaceLandmarker, evaluateProctoring } from "@/lib/proctoring";

interface ProctoringHUDProps {
  onViolation: (type: string, durationSeconds: number) => void;
  onViolationStateChange?: (type: string | null, isActive: boolean) => void;
  isCompleted: boolean;
  violationStrikes?: number;
}

// How many consecutive "bad" frames before we show a warning.
// At ~30fps, 90 frames ≈ 3 seconds of grace before flagging.
const VIOLATION_FRAME_THRESHOLD = 90;

export function ProctoringHUD({ onViolation, onViolationStateChange, isCompleted, violationStrikes = 0 }: ProctoringHUDProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const animationRef = useRef<number>(0);

  const [status, setStatus] = useState<"ok" | "error">("ok");
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Smoothing counters — we only flag after N consecutive bad frames
  const noFaceFrames = useRef(0);
  const multiFaceFrames = useRef(0);
  const headTurnFrames = useRef(0);

  const violationStartRef = useRef<{ type: string; timestamp: number } | null>(null);

  const startViolation = useCallback((type: string) => {
    if (!violationStartRef.current || violationStartRef.current.type !== type) {
      violationStartRef.current = { type, timestamp: Date.now() };
    }
  }, []);

  const clearViolation = useCallback(() => {
    if (violationStartRef.current) {
      const durationMs = Date.now() - violationStartRef.current.timestamp;
      if (durationMs > 1000) {
        onViolation(violationStartRef.current.type, Math.floor(durationMs / 1000));
      }
      violationStartRef.current = null;
    }
  }, [onViolation]);

  // Setup camera
  useEffect(() => {
    let active = true;

    async function setupCamera() {
      if (isCompleted) return;
      try {
        await initFaceLandmarker();
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (!active) return;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadeddata = () => {
            if (active) setVideoReady(true);
          };
        }
      } catch (err) {
        console.error("ProctoringHUD: Camera access error", err);
      }
    }

    setupCamera();

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isCompleted]);

  // Detection loop — starts only after video is ready
  useEffect(() => {
    if (!stream || !videoRef.current || isCompleted || !videoReady) return;

    const detect = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const state = evaluateProctoring(videoRef.current, performance.now());

        if (state.multipleFaces) {
          // Multiple faces: shorter grace (30 frames ≈ 1s)
          multiFaceFrames.current++;
          noFaceFrames.current = 0;
          headTurnFrames.current = 0;
          if (multiFaceFrames.current > 30) {
            setStatus("error");
            setWarningMessage("Multiple faces detected");
            startViolation("multiple_faces");
            onViolationStateChange?.("multiple_faces", true);
          }
        } else if (!state.faceDetected) {
          // No face: long grace period before flagging
          noFaceFrames.current++;
          multiFaceFrames.current = 0;
          headTurnFrames.current = 0;
          if (noFaceFrames.current > VIOLATION_FRAME_THRESHOLD) {
            setStatus("error");
            setWarningMessage("No face detected");
            startViolation("face_not_detected");
            onViolationStateChange?.("face_not_detected", true);
          }
        } else if (state.isLookingAway) {
          // Head turned sideways: medium grace (60 frames ≈ 2s)
          headTurnFrames.current++;
          noFaceFrames.current = 0;
          multiFaceFrames.current = 0;
          if (headTurnFrames.current > 60) {
            setStatus("error");
            setWarningMessage("Please face the screen");
            startViolation("look_away");
            onViolationStateChange?.("look_away", true);
          }
        } else {
          // All good — reset all counters immediately
          noFaceFrames.current = 0;
          multiFaceFrames.current = 0;
          headTurnFrames.current = 0;
          setStatus("ok");
          setWarningMessage(null);
          clearViolation();
          onViolationStateChange?.(null, false);
        }
      }
      animationRef.current = requestAnimationFrame(detect);
    };

    animationRef.current = requestAnimationFrame(detect);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [stream, videoReady, isCompleted, startViolation, clearViolation, onViolationStateChange]);

  if (isCompleted) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      {/* Warning Banner */}
      <AnimatePresence>
        {status === "error" && warningMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-2 rounded-lg bg-red-500/90 px-4 py-2 text-white shadow-lg backdrop-blur-md"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">⚠️ {warningMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Feed */}
      <motion.div
        layout
        className={`relative overflow-hidden rounded-xl border-2 shadow-2xl transition-colors duration-300 pointer-events-auto bg-base-900 ${
          status === "ok" ? "border-emerald-500/30" : "border-red-500/90"
        }`}
        style={{ width: 240, height: 180 }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
        />

        {/* Status Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 backdrop-blur-md">
          {status === "ok" ? (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          ) : warningMessage === "Multiple faces detected" ? (
            <Users className="h-3.5 w-3.5 text-red-400" />
          ) : (
            <UserX className="h-3.5 w-3.5 text-red-400" />
          )}
          <span
            className={`text-[10px] font-medium tracking-wide ${
              status === "ok" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {status === "ok" ? "Camera Active" : warningMessage}
          </span>
        </div>

        {/* Strikes Badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 backdrop-blur-md">
          <span
            className={`text-[10px] font-mono font-bold ${
              violationStrikes === 0
                ? "text-emerald-400"
                : violationStrikes === 1
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {violationStrikes}/2 Warnings
          </span>
        </div>

        {/* Red flash overlay on violation */}
        <AnimatePresence>
          {status === "error" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-500/20 mix-blend-overlay"
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
