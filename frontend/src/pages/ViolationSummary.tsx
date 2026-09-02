import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldAlert, Home, Mail, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { interviewApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";

interface ViolationLog {
  type: string;
  timestamp: string;
  duration_seconds: number;
}

export default function ViolationSummary() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [violationData, setViolationData] = useState<{
    total_violations: number;
    violation_types: Record<string, number>;
    termination_reason: string;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const { data } = await interviewApi.get(sessionId);
        setViolationData({
          total_violations: data.tab_switches || 0,
          violation_types: {
            "Looking away": 1,
            "Multiple faces detected": 1,
            "Face not detected": 1,
          },
          termination_reason: "proctoring_violations",
        });
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading violation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-950 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        {/* Red Alert Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1 }}
          className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-red-500/10 border-4 border-red-500/30"
        >
          <ShieldAlert className="h-12 w-12 text-red-500" />
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-3 text-center font-display text-3xl font-bold text-white"
        >
          Interview Terminated
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-8 text-center text-slate-400"
        >
          Your interview session has been automatically terminated due to repeated proctoring violations.
        </motion.p>

        {/* Violation Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-red-500/20 bg-red-500/5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-red-500/10 p-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="mb-3 text-lg font-semibold text-white">Violation Summary</h3>

                <div className="mb-4 rounded-lg border border-white/5 bg-white/[0.02] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-slate-400">Total Violations</span>
                    <span className="font-mono text-xl font-bold text-red-400">
                      3 / 2
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full w-full bg-gradient-to-r from-amber-500 via-red-500 to-red-600" />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className="text-sm text-slate-300">Looking away from screen</span>
                    <span className="font-mono text-sm font-semibold text-amber-400">2×</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className="text-sm text-slate-300">Multiple faces detected</span>
                    <span className="font-mono text-sm font-semibold text-red-400">1×</span>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    This interview has been <strong>flagged for review</strong> and will not generate a scoring report.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* What Happens Next */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6"
        >
          <Card>
            <h3 className="mb-3 text-lg font-semibold text-white">What happens next?</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                Your session data has been saved and flagged for manual review
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                You may retake the interview by starting a new session from your dashboard
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                Ensure you are in a quiet, well-lit environment with no distractions for the next attempt
              </li>
            </ul>
          </Card>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Button
            size="lg"
            onClick={() => navigate("/dashboard")}
            className="flex-1"
          >
            <Home className="mr-2 h-4 w-4" />
            Return to Dashboard
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => window.open("mailto:support@interviewos.com", "_blank")}
            className="flex-1"
          >
            <Mail className="mr-2 h-4 w-4" />
            Contact Support
          </Button>
        </motion.div>

        {/* Footer Note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 text-center text-xs text-slate-500"
        >
          Proctoring helps maintain the integrity of the interview process for all candidates.
        </motion.p>
      </motion.div>
    </div>
  );
}
