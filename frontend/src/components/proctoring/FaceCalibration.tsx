import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initFaceLandmarker, evaluateProctoring, ProctoringState } from "@/lib/proctoring";

interface FaceCalibrationProps {
  onSuccess: () => void;
}

export function FaceCalibration({ onSuccess }: FaceCalibrationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  const [isCentered, setIsCentered] = useState(false);
  const [centeredSince, setCenteredSince] = useState<number | null>(null);
  const [canProceed, setCanProceed] = useState(false);
  const animationRef = useRef<number>(0);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    async function setupCamera() {
      try {
        await initFaceLandmarker();
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (!active) return;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          // Wait for video to actually be ready before starting detection
          videoRef.current.onloadeddata = () => {
            if (active) setVideoReady(true);
          };
        }
      } catch (err) {
        if (active) setError("Could not access camera. Please check permissions.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    setupCamera();

    // Show skip button after 8 seconds in case detection never works
    skipTimerRef.current = setTimeout(() => {
      if (active) setShowSkip(true);
    }, 8000);

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!stream || !videoRef.current || !videoReady) return;

    const detect = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const state = evaluateProctoring(videoRef.current, performance.now());

        if (state.faceDetected && state.isCentered && !state.multipleFaces && !state.isLookingAway) {
          setIsCentered(true);
          setCenteredSince((prev) => {
            if (!prev) return Date.now();
            if (Date.now() - prev > 2000) {
              setCanProceed(true);
            }
            return prev;
          });
        } else {
          setIsCentered(false);
          setCenteredSince(null);
          setCanProceed(false);
        }
      }
      animationRef.current = requestAnimationFrame(detect);
    };

    animationRef.current = requestAnimationFrame(detect);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [stream, videoReady]);

  const handleConfirm = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-base-900 p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/20 text-accent-400">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Face Calibration</h2>
            <p className="text-sm text-white/50">Please align your face within the frame.</p>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 py-12 px-6 text-center">
            <ShieldAlert className="mb-3 h-8 w-8 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black/50 aspect-video flex items-center justify-center">
            {isLoading && <p className="text-sm text-white/50">Loading camera...</p>}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                isLoading ? "opacity-0" : "opacity-100"
              } scale-x-[-1]`}
            />
            {/* Alignment Guide Overlay */}
            {!isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`h-4/5 w-3/5 rounded-[40%] border-2 transition-colors duration-300 ${
                    isCentered ? "border-emerald-500 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/5"
                  }`}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCentered ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Position optimal
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-400">
                Center your face and look at the camera
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showSkip && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleConfirm}
                className="text-white/40 hover:text-white/60 text-xs"
              >
                Skip
              </Button>
            )}
            <Button onClick={handleConfirm} disabled={!canProceed || !!error} size="sm">
              Confirm & Start
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
