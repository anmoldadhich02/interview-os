import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, CheckCircle2, Circle, Globe, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { interviewApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";
import { useFullscreen } from "@/hooks/useFullscreen";
import type { Resume } from "@/types";
import { FaceCalibration } from "@/components/proctoring/FaceCalibration";

const SUGGESTED_COMPANIES = [
  "Google", "Amazon", "Stripe", "Meta", "Netflix",
  "Microsoft", "Apple", "Anthropic", "Uber", "Airbnb",
];

// ── Research progress steps ───────────────────────────────────────────────────

interface Step {
  label: string;
  sublabel: string;
  durationMs: number;   // approximate time before next step appears
}

function buildSteps(company: string): Step[] {
  return [
    {
      label: "Analysing your resume",
      sublabel: "Building candidate profile…",
      durationMs: 1800,
    },
    {
      label: `Researching ${company} interviews`,
      sublabel: "Scanning Glassdoor, Reddit, LeetCode Discuss…",
      durationMs: 9000,
    },
    {
      label: "Structuring knowledge base",
      sublabel: "Extracting questions, coding patterns, LP principles…",
      durationMs: 4500,
    },
    {
      label: "Building personalised interview plan",
      sublabel: "Adapting stage order to company & role…",
      durationMs: 2500,
    },
    {
      label: "Generating your first question",
      sublabel: "Almost ready!",
      durationMs: 2000,
    },
  ];
}

function ResearchProgress({ company }: { company: string }) {
  const steps = buildSteps(company);
  const [activeStep, setActiveStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let current = 0;
    const advance = () => {
      current += 1;
      if (current < steps.length) {
        setActiveStep(current);
        timerRef.current = setTimeout(advance, steps[current].durationMs);
      }
    };
    timerRef.current = setTimeout(advance, steps[0].durationMs);
    return () => clearTimeout(timerRef.current);
  }, []); // intentionally only fires once

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 rounded-2xl border border-white/[0.07] bg-base-900/50 p-6 backdrop-blur-sm"
    >
      <div className="mb-5 flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-accent-400 animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-400 font-mono">
          Researching {company}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {steps.map((step, i) => {
          const done = i < activeStep;
          const active = i === activeStep;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: i <= activeStep ? 1 : 0.25, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-start gap-3"
            >
              <div className="mt-0.5 shrink-0">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent-400" />
                ) : (
                  <Circle className="h-4 w-4 text-white/15" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${
                  done ? "text-white/30 line-through" : active ? "text-white/85" : "text-white/25"
                }`}>
                  {step.label}
                </p>
                <AnimatePresence>
                  {active && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-0.5 text-xs text-white/35"
                    >
                      {step.sublabel}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-5 text-[11px] text-white/20 font-mono">
        This one-time research takes 10–20 s and makes every question company-specific.
      </p>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StartInterview() {
  const location = useLocation();
  const navigate = useNavigate();

  // Resume from navigation state (fresh) or localStorage (after refresh / direct nav)
  const stateResume = (location.state as { resume?: Resume } | null)?.resume;
  const [resume, setResume] = useState<Resume | null>(() => {
    if (stateResume) return stateResume;
    try {
      const raw = localStorage.getItem("interviewos_resume");
      return raw ? (JSON.parse(raw) as Resume) : null;
    } catch {
      return null;
    }
  });

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("Software Engineer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  
  const { enterFullscreen } = useFullscreen();

  if (!resume) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center pt-24">
        <p className="text-white/40 mb-6 text-sm">No resume found. Upload your resume first to start an interview.</p>
        <Button variant="outline" onClick={() => navigate("/resume")}>
          Upload resume
        </Button>
      </div>
    );
  }

  const handleStart = async () => {
    if (!company.trim()) {
      setError("Pick or type a target company.");
      return;
    }
    setError(null);
    setShowCalibration(true);
  };

  const startInterviewSession = async () => {
    setShowCalibration(false);
    setLoading(true);
    
    // Attempt to enter fullscreen immediately upon user interaction
    enterFullscreen();
    
    try {
      const { data } = await interviewApi.start({
        resume_id: resume.id,
        target_company: company.trim(),
        target_role: role.trim() || "Software Engineer",
      });
      navigate(`/interview/${data.id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setLoading(false);   // restore form only on error
    }
    // Note: we intentionally leave loading=true on success so the screen
    // stays frozen while the browser navigates away.
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 pt-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-display text-2xl font-bold text-white/90 tracking-tight">Where are you interviewing?</h1>
        <p className="mt-1.5 text-sm text-white/35 leading-relaxed">
          The Company Research Agent will build a personalized question plan based on your target company and role.
        </p>
      </motion.div>

      {/* Resume pill */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-white/6 bg-white/3 px-4 py-2.5">
        <span className="text-[11px] text-white/30 font-mono">resume:</span>
        <span className="text-xs font-medium text-white/55 flex-1 truncate font-mono">
          {resume.original_filename}
        </span>
        <button
          className="text-xs text-accent-400 hover:text-accent-300 transition-colors font-medium"
          onClick={() => navigate("/resume")}
        >
          Change
        </button>
      </div>

      <AnimatePresence mode="wait">
        {!loading ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card variant="elevated">
              <div className="flex flex-col gap-5">
                <div>
                  <Input
                    label="Target company"
                    placeholder="Type any company name…"
                    id="start-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {SUGGESTED_COMPANIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCompany(c)}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
                          company === c
                            ? "border-accent-500/40 bg-accent-500/8 text-accent-400"
                            : "border-white/8 bg-white/3 text-white/40 hover:border-white/15 hover:text-white/60"
                        }`}
                      >
                        <Building2 className="h-2.5 w-2.5" /> {c}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Target role"
                  placeholder="e.g. Senior Backend Engineer"
                  id="start-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />

                {error && (
                  <div className="rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2">
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                )}

                <Button size="lg" loading={loading} onClick={handleStart} className="w-full gap-2">
                  <Sparkles className="h-4 w-4" /> Start interview
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10">
            <ResearchProgress company={company} />
          </motion.div>
        )}
      </AnimatePresence>

      {showCalibration && (
        <FaceCalibration onSuccess={startInterviewSession} />
      )}
    </div>
  );
}
