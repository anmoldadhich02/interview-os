import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Code2, Loader2, Sparkles, ChevronDown, CheckCircle2, XCircle,
  AlertCircle, BarChart2, Lock, AlertTriangle
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { VoiceControls } from "@/components/ui/VoiceControls";
import { CodingEnvironment } from "@/components/coding/CodingEnvironment";
import { McqEnvironment } from "@/components/mcq/McqEnvironment";
import { ProctoringHUD } from "@/components/proctoring/ProctoringHUD";
import { ViolationWarningOverlay } from "@/components/proctoring/ViolationWarningOverlay";
import { interviewApi, reportApi } from "@/api/endpoints";
import { extractErrorMessage, apiClient } from "@/api/client";
import { useVoiceInterview } from "@/lib/useVoiceInterview";
import { useFullscreen } from "@/hooks/useFullscreen";
import type { CodeEvaluation, Evaluation, Question, TranscriptTurn } from "@/types";

// ── Stage / difficulty display ────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  resume_discussion: "Resume Discussion",
  technical:         "Technical",
  coding_round:      "Coding Round",
  project_deep_dive: "Project Deep Dive",
  behavioral:        "Behavioral",
  system_design:     "System Design",
  wrap_up:           "Wrap Up",
};

const STAGE_ICONS: Record<string, string> = {
  coding_round: "💻",
  technical:    "⚙️",
  behavioral:   "🤝",
  system_design:"🏗️",
};

const difficultyTone: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  easy:   "success",
  medium: "accent",
  hard:   "warning",
  senior: "warning",
  staff:  "danger",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCodingEval(e: Evaluation | CodeEvaluation): e is CodeEvaluation {
  return "correctness_score" in e;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Interview() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("resume_discussion");
  const [difficulty, setDifficulty] = useState("medium");
  const [completed, setCompleted] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [violationCount, setViolationCount] = useState(0);
  const [violationStrikes, setViolationStrikes] = useState(0); // 0, 1, 2
  const [activeViolation, setActiveViolation] = useState<string | null>(null);
  const [isViolationActive, setIsViolationActive] = useState(false);

  // Scores hidden during interview — revealed only after completion
  const [scoresRevealed, setScoresRevealed] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInterview(sessionId);

  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen();
  const lastViolationTime = useRef(0);

  const triggerViolation = useCallback(async () => {
    if (completed) return;
    const now = Date.now();
    if (now - lastViolationTime.current < 2000) return; // debounce double-triggers (e.g. esc + tab switch)
    lastViolationTime.current = now;

    setViolationCount((prev) => prev + 1);
    if (sessionId) {
      try {
        await interviewApi.recordViolation(sessionId);
      } catch (err) {
        console.error("Failed to record violation", err);
      }
    }
  }, [sessionId, completed]);

  // ── Proctoring & Fullscreen ───────────────────────────────────────────────

  useEffect(() => {
    // Attempt to enter fullscreen on mount, or first click if blocked
    if (!document.fullscreenElement) {
      enterFullscreen();
    }

    const onFirstClick = () => {
      if (!document.fullscreenElement) enterFullscreen();
      document.removeEventListener("click", onFirstClick);
    };
    document.addEventListener("click", onFirstClick);

    // Track tab switches
    const handleVisibilityChange = () => {
      if (document.hidden && !completed) {
        triggerViolation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("click", onFirstClick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [completed, enterFullscreen, triggerViolation]);

  // Log proctoring violation if user exits fullscreen
  useEffect(() => {
    if (!isFullscreen && !completed && !loadingInitial) {
      triggerViolation();
    }
  }, [isFullscreen, completed, loadingInitial, triggerViolation]);

  // Terminate after 3 violations
  useEffect(() => {
    if (violationCount >= 3 && !completed && !finishing) {
      alert("Maximum violations (3) reached. The interview will now terminate.");
      handleFinish();
    }
  }, [violationCount, completed, finishing]);

  // ── Load initial session & first question ─────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const [sessionRes, questionsRes] = await Promise.all([
          interviewApi.get(sessionId),
          interviewApi.listQuestions(sessionId),
        ]);
        setStage(sessionRes.data.current_stage);
        setDifficulty(sessionRes.data.current_difficulty);

        const questions = questionsRes.data;
        const sessionStatus = sessionRes.data.status;

        // Rebuild transcript from already-answered questions (supports refresh/resume)
        const answered = questions.filter((q) => q.answer_text != null);
        const restoredTranscript: TranscriptTurn[] = answered.map((q) => ({
          question: q,
          answerText: q.answer_text as string,
          evaluation: (q.answer_evaluation ?? {}) as unknown as Evaluation,
          isCoding: q.question_type === "coding",
        }));
        if (restoredTranscript.length > 0) {
          setTranscript(restoredTranscript);
        }

        if (sessionStatus === "completed") {
          setCompleted(true);
          setCurrentQuestion(null);
        } else {
          // Current question = last unanswered question
          const unanswered = questions.filter((q) => q.answer_text == null);
          if (unanswered.length > 0) {
            setCurrentQuestion(unanswered[unanswered.length - 1]);
          }
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingInitial(false);
      }
    })();
  }, [sessionId]);

  // ── Auto-play question via TTS when currentQuestion changes ───────────────
  // Only fires for voice questions; coding questions show the CodingEnvironment.

  useEffect(() => {
    if (!currentQuestion || !sessionId || completed) return;

    if (currentQuestion.question_type === "coding") {
      // For coding questions, play a brief spoken announcement then stop.
      // The CodingEnvironment handles all interaction from here.
      (async () => {
        try {
          await voice.playQuestion(currentQuestion.text);
        } catch { /* surfaced through voice.voiceError */ }
      })();
      return () => voice.reset();
    }

    if (currentQuestion.question_type === "mcq") {
      // Rapid MCQ round is completely silent — no voice-over or microphone.
      voice.reset();
      return () => voice.reset();
    }

    // Voice question — play TTS then open mic.
    setPendingTranscript("");
    (async () => {
      try {
        await voice.playQuestion(currentQuestion.text);
        await new Promise((r) => setTimeout(r, 50));
        await voice.startRecording();
      } catch { /* surfaced through voice.voiceError */ }
    })();
    return () => voice.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, currentQuestion]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => () => voice.reset(), []);

  // ── Voice handlers ────────────────────────────────────────────────────────

  const handleStopRecording = async () => {
    if (!sessionId || !currentQuestion) return;
    setError(null);

    let answerText: string;
    try {
      answerText = await voice.stopAndTranscribe();
    } catch {
      return;
    }

    if (!answerText.trim()) {
      setError("No speech detected. Please try again.");
      try { await voice.startRecording(); } catch { /* ignore */ }
      return;
    }

    setPendingTranscript(answerText);
    await submitVoiceAnswer(currentQuestion, answerText);
  };

  const submitVoiceAnswer = async (question: Question, answerText: string) => {
    if (!sessionId) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data } = await interviewApi.submitAnswer(sessionId, {
        question_id: question.id,
        text: answerText.trim(),
      });

      setTranscript((prev) => [
        ...prev,
        { question, answerText: answerText.trim(), evaluation: data.evaluation },
      ]);
      setPendingTranscript("");
      setStage(data.current_stage);
      setDifficulty(data.current_difficulty);

      if (data.session_status === "completed") {
        setCompleted(true);
        setCurrentQuestion(null);
      } else {
        if (data.next_question) {
          // Only pre-fetch TTS for voice questions (not coding or MCQ rapid round)
          if (data.next_question.question_type !== "coding" && data.next_question.question_type !== "mcq") {
            voice.prefetchTTS(data.next_question.text);
          }
        }
        setCurrentQuestion(data.next_question);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
      try { await voice.startRecording(); } catch { /* ignore */ }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartRecording = async () => {
    setError(null);
    setPendingTranscript("");
    try {
      await voice.startRecording();
    } catch { /* voice.voiceError already set */ }
  };

  // ── Code submit handler ───────────────────────────────────────────────────

  const handleCodeSubmit = useCallback(async (result: {
    evaluation: CodeEvaluation;
    next_question: Question | null;
  }) => {
    if (!currentQuestion) return;

    setTranscript((prev) => [
      ...prev,
      {
        question: currentQuestion,
        answerText: `[Code submitted — ${result.evaluation.tests_passed}/${result.evaluation.tests_total} tests passed]`,
        evaluation: result.evaluation,
        isCoding: true,
      },
    ]);

    if (!result.next_question) {
      setCompleted(true);
      setCurrentQuestion(null);
      return;
    }

    // Pre-fetch TTS for the voice follow-up
    if (result.next_question.question_type !== "coding" && result.next_question.question_type !== "mcq") {
      voice.prefetchTTS(result.next_question.text);
    }
    setCurrentQuestion(result.next_question);
  }, [currentQuestion, voice]);

  // ── MCQ submit handler ───────────────────────────────────────────────────

  const handleMcqSubmit = useCallback((data: {
    evaluation: Evaluation;
    next_question: Question | null;
    session_status: string;
    current_stage: string;
    current_difficulty: string;
    selected_option: string;
  }) => {
    if (!currentQuestion) return;

    setTranscript((prev) => [
      ...prev,
      {
        question: currentQuestion,
        answerText: data.selected_option,
        evaluation: data.evaluation,
      },
    ]);
    setPendingTranscript("");
    if (data.current_stage) setStage(data.current_stage);
    if (data.current_difficulty) setDifficulty(data.current_difficulty);

    if (data.session_status === "completed" || !data.next_question) {
      setCompleted(true);
      setCurrentQuestion(null);
    } else {
      if (data.next_question.question_type !== "coding" && data.next_question.question_type !== "mcq") {
        voice.prefetchTTS(data.next_question.text);
      }
      setCurrentQuestion(data.next_question);
    }
  }, [currentQuestion, voice]);

  // ── Auto-Terminate Handler ────────────────────────────────────────────────

  const handleAutoTerminate = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;

    setCompleted(true);
    await exitFullscreen();

    if (sessionId) {
      try {
        await apiClient.post(`/api/interviews/${sessionId}/terminate`, {
          reason: "proctoring_violations",
          violation_count: 3
        });
      } catch (err) {
        console.error("Failed to terminate session in backend", err);
      }
      navigate(`/interview/${sessionId}/terminated`);
    }
  }, [sessionId, exitFullscreen, navigate]);

  const completing = useRef(false);

  // ── Violation State Change Handler ────────────────────────────────────────

  const handleViolationStateChange = useCallback((type: string | null, isActive: boolean) => {
    if (completed) return;

    setActiveViolation(type);
    setIsViolationActive(isActive);
  }, [completed]);

  // Track violation duration and increment strikes
  const violationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isViolationActive || completed) {
      // Clear timer when violation clears
      if (violationTimerRef.current) {
        clearTimeout(violationTimerRef.current);
        violationTimerRef.current = null;
      }
      return;
    }

    // Start timer: increment strikes every 4 seconds of continuous violation
    violationTimerRef.current = setTimeout(() => {
      setViolationStrikes((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          // Terminate interview after 3rd strike
          handleAutoTerminate();
          return prev;
        }
        return next;
      });
    }, 4000);

    return () => {
      if (violationTimerRef.current) {
        clearTimeout(violationTimerRef.current);
      }
    };
  }, [isViolationActive, completed, handleAutoTerminate]);

  // ── Proctoring Violation Handler ──────────────────────────────────────────

  const handleProctoringViolation = useCallback((type: string, durationSeconds: number) => {
    if (completed) return;
    
    // Also trigger the standard violation to increment tab_switches count for backwards compatibility,
    // but the backend will handle the specific types via the updated endpoint.
    const now = Date.now();
    if (now - lastViolationTime.current < 2000) return;
    lastViolationTime.current = now;

    if (sessionId) {
      apiClient.post(`/api/interviews/${sessionId}/violation`, {
        violation_type: type,
        duration_seconds: durationSeconds
      }).catch((err: unknown) => console.error("Failed to record specific violation", err));
    }
  }, [sessionId, completed]);

  // ── Finish ────────────────────────────────────────────────────────────────

  const handleFinish = async () => {
    if (!sessionId) return;
    setFinishing(true);
    await exitFullscreen();
    try {
      await reportApi.generate(sessionId);
      navigate(`/report/${sessionId}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setFinishing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingInitial) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent-400" />
      </div>
    );
  }

  if (error && !currentQuestion && !completed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-950 p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-red-500/20 bg-red-500/10 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="mb-2 font-display text-xl font-bold text-white">Error Loading Question</h2>
          <p className="mb-6 text-sm text-red-300">{error}</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
              Dashboard
            </Button>
            <Button onClick={() => window.location.reload()} className="w-full">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion && !completed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-950 p-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent-400" />
          <p className="text-sm font-medium text-slate-300">Preparing your interview question…</p>
        </div>
      </div>
    );
  }

  // Intercept normal rendering if the user is out of fullscreen (Paused Screen)
  if (!isFullscreen && !completed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-950 p-6 text-center">
        <div className="max-w-md w-full rounded-3xl border border-red-500/20 bg-red-500/10 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <AlertTriangle className="h-8 w-8 text-red-500 animate-pulse" />
          </div>
          <h2 className="mb-2 font-display text-2xl font-bold text-white tracking-tight">Interview Paused</h2>
          <div className="mb-8 space-y-3 text-sm text-red-400/90 leading-relaxed">
            <p>You have exited fullscreen mode or switched tabs.</p>
            <div className="inline-block rounded-lg bg-red-500/20 px-4 py-2 font-mono font-semibold text-red-400">
              Violations: {violationCount} / 3
            </div>
            <p className="text-xs text-red-400/70">
              The interview will automatically terminate and calculate your final score if you reach 3 violations.
            </p>
          </div>
          <Button size="lg" onClick={enterFullscreen} className="w-full font-semibold bg-red-500 hover:bg-red-600 text-white border-none shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)]">
            Re-enter Fullscreen
          </Button>
        </div>
      </div>
    );
  }

  const isCodingQuestion = currentQuestion?.question_type === "coding";
  const answeredCount = transcript.length;
  let content;

  // Full-screen coding environment
  const isMcqQuestion = currentQuestion?.question_type === "mcq";
  const mcqQuestionIndex = transcript.filter((t) => t.question.question_type === "mcq").length + 1;

  if (isCodingQuestion && currentQuestion && sessionId && !completed) {
    content = (
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Mini stage header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-base-950/80 px-5 py-2 backdrop-blur">
          <Badge tone="accent">
            <Code2 className="mr-1 h-3 w-3" />
            Coding Round
          </Badge>
          <Badge tone={difficultyTone[difficulty] ?? "neutral"}>{difficulty}</Badge>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-400/70">
            <Lock className="h-3 w-3" />
            Scores revealed after interview
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <CodingEnvironment
            question={currentQuestion}
            sessionId={sessionId}
            onSubmit={handleCodeSubmit}
          />
        </div>
      </div>
    );
  } else if (isMcqQuestion && currentQuestion && sessionId && !completed) {
    content = (
      <div className="flex min-h-screen flex-col">
        <McqEnvironment
          question={currentQuestion}
          sessionId={sessionId}
          mcqIndex={mcqQuestionIndex}
          totalMcqs={20}
          onSubmit={handleMcqSubmit}
        />
      </div>
    );
  } else {

  // Standard voice interview layout
  content = (
    <div className="mx-auto flex max-w-4xl flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {STAGE_ICONS[stage] && <span className="text-base">{STAGE_ICONS[stage]}</span>}
          <Badge tone="accent">{STAGE_LABELS[stage] ?? stage}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-amber-400/70">
            <Lock className="h-3 w-3" />
            Scores hidden until end
          </span>
          <Badge tone={difficultyTone[difficulty] ?? "neutral"}>{difficulty}</Badge>
        </div>
      </div>
      <ProgressBar value={Math.min(answeredCount, 20)} max={20} />

      <div className="mt-8 flex flex-col gap-6">
        {transcript.map((turn) => (
          <div key={turn.question.id} className="flex flex-col gap-3">
            <TranscriptQuestion text={turn.question.text} isFollowup={turn.question.is_followup} />
            <TranscriptAnswer text={turn.answerText} isCoding={turn.isCoding} />
            {/* Quiet status only during interview — no numeric scores */}
            <QuietStatusStrip evaluation={turn.evaluation} isCoding={turn.isCoding} />
          </div>
        ))}

        <AnimatePresence mode="wait">
          {currentQuestion && (
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-3"
            >
              <TranscriptQuestion
                text={currentQuestion.text}
                isFollowup={currentQuestion.is_followup}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {completed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-4"
          >
            <Card className="text-center">
              <Sparkles className="mx-auto h-6 w-6 text-accent-400" />
              <p className="mt-3 font-display text-xl font-semibold">Interview complete!</p>
              <p className="mt-1 text-sm text-slate-400">
                Great work. View the full report for detailed feedback and your hiring recommendation.
              </p>
              <Button className="mt-5" size="lg" loading={finishing} onClick={handleFinish}>
                View my report
              </Button>
            </Card>

            {/* Deferred score reveal — collapsible */}
            <div className="rounded-2xl border border-white/8 bg-base-900/60 backdrop-blur">
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
                onClick={() => setScoresRevealed((p) => !p)}
              >
                <div className="flex items-center gap-2.5">
                  <BarChart2 className="h-4 w-4 text-accent-400" />
                  <span className="text-sm font-semibold text-slate-200">
                    Review your scores ({transcript.length} questions)
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
                    scoresRevealed ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {scoresRevealed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-5 border-t border-white/8 px-5 pb-5 pt-4">
                      {transcript.map((turn, i) => (
                        <div key={turn.question.id} className="flex flex-col gap-2">
                          <p className="text-xs font-medium text-slate-500">
                            Q{i + 1}{turn.isCoding ? " · Coding" : ""}{" "}
                            <span className="text-slate-400">
                              — {turn.question.text.slice(0, 90)}{turn.question.text.length > 90 ? "…" : ""}
                            </span>
                          </p>
                          <EvaluationStrip evaluation={turn.evaluation} isCoding={turn.isCoding} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} className="h-24" />
      </div>

      {/* Voice input panel */}
      {currentQuestion && !completed && !isCodingQuestion && (
        <div className="sticky bottom-0 pb-6 pt-12 mt-8 bg-gradient-to-t from-base-950 via-base-950/95 to-transparent">
          <Card className="shadow-2xl border-white/10">
            {submitting ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-7 w-7 animate-spin text-accent-400" />
                <p className="text-sm text-slate-400">Evaluating your answer…</p>
              </div>
            ) : (
              <VoiceControls
                voiceState={voice.voiceState}
                transcript={pendingTranscript}
                voiceError={voice.voiceError ?? error}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
              />
            )}
            {error && !voice.voiceError && (
              <p className="mt-2 text-center text-xs text-red-400">{error}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
  }

  return (
    <>
      {content}
      <ViolationWarningOverlay
        violationStrikes={violationStrikes}
        currentViolationType={activeViolation}
        isActive={isViolationActive}
      />
      <ProctoringHUD
        onViolation={handleProctoringViolation}
        onViolationStateChange={handleViolationStateChange}
        isCompleted={completed}
        violationStrikes={violationStrikes}
      />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TranscriptQuestion({ text, isFollowup }: { text: string; isFollowup: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-400">
        AI
      </div>
      <div className="glass-panel rounded-2xl rounded-tl-sm px-4 py-3">
        {isFollowup && (
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent-400">
            Follow-up
          </p>
        )}
        <p className="text-sm leading-relaxed text-slate-100">{text}</p>
      </div>
    </div>
  );
}

function TranscriptAnswer({ text, isCoding }: { text: string; isCoding?: boolean }) {
  return (
    <div className="flex justify-end gap-3">
      <div className={`max-w-xl rounded-2xl rounded-tr-sm border px-4 py-3 ${
        isCoding
          ? "bg-cyan-500/10 border-cyan-500/20"
          : "bg-accent-500/10 border-accent-500/20"
      }`}>
        {isCoding && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-cyan-400">
            <Code2 className="h-3 w-3" /> Code submission
          </p>
        )}
        <p className="text-sm leading-relaxed text-slate-200">{text}</p>
      </div>
      <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-base-800 text-xs font-semibold text-slate-300">
        You
      </div>
    </div>
  );
}

const RELEVANCE_STYLES: Record<string, { label: string; className: string }> = {
  DIRECTLY_RELEVANT:     { label: "On-topic",   className: "text-emerald-400" },
  PARTIALLY_RELEVANT:    { label: "Partial",     className: "text-amber-400" },
  TANGENTIALLY_RELEVANT: { label: "Off-tangent", className: "text-orange-400" },
  IRRELEVANT:            { label: "Off-topic",   className: "text-red-400" },
  EMPTY:                 { label: "Empty",       className: "text-slate-500" },
  SKIPPED:               { label: "Skipped",     className: "text-slate-500" },
};

/**
 * Shown DURING the interview — only ✓/✗, no numeric scores.
 */
function QuietStatusStrip({
  evaluation,
  isCoding,
}: {
  evaluation: TranscriptTurn["evaluation"];
  isCoding?: boolean;
}) {
  if (isCoding) {
    const ev = evaluation as CodeEvaluation;
    const allPassed = ev.tests_passed === ev.tests_total && ev.tests_total > 0;
    const hasError = (ev as any).execution_service_error;
    return (
      <div className="ml-10 flex items-center gap-2 text-xs">
        {hasError ? (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" />
            Execution error (not penalised)
          </span>
        ) : allPassed ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {ev.tests_passed}/{ev.tests_total} tests passed
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="h-3.5 w-3.5" />
            {ev.tests_passed}/{ev.tests_total} tests passed
          </span>
        )}
        <span className="text-slate-700">·</span>
        <span className="text-slate-600">score hidden</span>
      </div>
    );
  }

  const ev = evaluation as Evaluation;
  const answered = ev.answers_current_question;
  return (
    <div className="ml-10 flex items-center gap-2 text-xs">
      {answered ? (
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Answered
        </span>
      ) : (
        <span className="flex items-center gap-1 text-amber-400">
          <AlertCircle className="h-3.5 w-3.5" />
          Partially addressed
        </span>
      )}
      <span className="text-slate-700">·</span>
      <span className="text-slate-600">score hidden</span>
    </div>
  );
}

/**
 * Full evaluation strip shown AFTER interview completes (inside the collapsible panel).
 */
function EvaluationStrip({
  evaluation,
  isCoding,
}: {
  evaluation: TranscriptTurn["evaluation"];
  isCoding?: boolean;
}) {
  if (isCoding) {
    const ev = evaluation as CodeEvaluation;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-slate-500">
        <span className="font-semibold text-cyan-400">Score: {ev.overall_score}/100</span>
        <span>•</span>
        <span className="text-emerald-400">
          {ev.tests_passed}/{ev.tests_total} tests passed
        </span>
        <span>•</span>
        <span>Time: {ev.time_complexity}</span>
        <span>•</span>
        <span>Space: {ev.space_complexity}</span>
        {ev.feedback && (
          <>
            <span>•</span>
            <span className="text-slate-400">{ev.feedback}</span>
          </>
        )}
      </div>
    );
  }

  const ev = evaluation as Evaluation;
  const classification = ev.relevance_classification ?? "DIRECTLY_RELEVANT";
  const relevanceStyle = RELEVANCE_STYLES[classification] ?? RELEVANCE_STYLES.IRRELEVANT;
  const isOffTopic = !ev.answers_current_question && classification !== "DIRECTLY_RELEVANT";

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-slate-500">
        <span className="font-semibold text-accent-400">Score: {ev.overall_score}/100</span>
        <span>•</span>
        <span className={`font-medium ${relevanceStyle.className}`}>{relevanceStyle.label}</span>
        {ev.score_cap < 100 && (
          <>
            <span>•</span>
            <span className="text-slate-600">Cap: {ev.score_cap}</span>
          </>
        )}
        <span>•</span>
        <span className="text-slate-400">{ev.feedback}</span>
      </div>

      {isOffTopic && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-red-400">
          <span className="font-semibold">⚠ Answer flagged as {relevanceStyle.label.toLowerCase()}.</span>{" "}
          {ev.reason_for_score_cap ?? "Your response did not address the current question."}
        </div>
      )}

      {ev.missing_requirements && ev.missing_requirements.length > 0 && (
        <div className="text-slate-500">
          <span className="font-medium text-slate-400">Missing: </span>
          {ev.missing_requirements.join(" · ")}
        </div>
      )}
    </div>
  );
}
