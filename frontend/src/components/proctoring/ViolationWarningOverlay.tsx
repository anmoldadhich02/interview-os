import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Users, UserX, Eye } from "lucide-react";

interface ViolationWarningOverlayProps {
  violationStrikes: number; // 0, 1, or 2
  currentViolationType: string | null; // "look_away", "multiple_faces", "face_not_detected"
  isActive: boolean; // true when violation is currently happening
}

const VIOLATION_MESSAGES: Record<string, string> = {
  look_away: "Looking away from screen detected",
  multiple_faces: "Multiple people detected in frame",
  face_not_detected: "No face detected - please stay in frame",
};

const VIOLATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  look_away: Eye,
  multiple_faces: Users,
  face_not_detected: UserX,
};

export function ViolationWarningOverlay({
  violationStrikes,
  currentViolationType,
  isActive,
}: ViolationWarningOverlayProps) {
  if (!isActive || violationStrikes >= 2) {
    return null;
  }

  const message = currentViolationType ? VIOLATION_MESSAGES[currentViolationType] : "Proctoring violation detected";
  const Icon = currentViolationType ? VIOLATION_ICONS[currentViolationType] : AlertTriangle;
  const isFinalWarning = violationStrikes === 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 pointer-events-none"
      >
        {/* Top Warning Banner */}
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={`absolute top-0 left-0 right-0 ${
            isFinalWarning
              ? "bg-gradient-to-r from-red-600 via-red-500 to-red-600"
              : "bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600"
          } ${isFinalWarning ? "animate-pulse" : ""}`}
        >
          <div className="mx-auto max-w-4xl px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isFinalWarning ? "bg-white/20" : "bg-white/15"
                  }`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {isFinalWarning ? "⚠️ WARNING 2/2 - FINAL WARNING" : "⚠️ WARNING 1/2"}
                  </h2>
                  <p className="text-sm text-white/90 font-medium">{message}</p>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-end gap-1">
                <span className="text-xs font-medium text-white/80 uppercase tracking-wider">
                  {isFinalWarning ? "Next violation terminates interview" : "Correct within 10 seconds"}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${isFinalWarning ? "bg-white" : "bg-white/60"}`} />
                  <div className={`h-2.5 w-2.5 rounded-full ${isFinalWarning ? "bg-white" : "bg-white/30"}`} />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom gradient fade */}
          <div
            className={`h-3 ${
              isFinalWarning
                ? "bg-gradient-to-b from-red-500/50 to-transparent"
                : "bg-gradient-to-b from-amber-500/50 to-transparent"
            }`}
          />
        </motion.div>

        {/* Backdrop overlay (subtle) */}
        {isFinalWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-red-500/20 backdrop-blur-[1px]"
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
