import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Upload, ChevronDown, CheckCircle2, XCircle,
  Clock, Cpu, Layers, Code2, Zap, AlertTriangle, AlertCircle,
  ChevronRight, Terminal,
} from "lucide-react";
import type {
  CodingProblem, CodeEvaluation, CodeRunResult, Question, RunTestsResult, TestCaseResult,
} from "@/types";
import { CodeEditor, SUPPORTED_LANGUAGES } from "./CodeEditor";
import { CodingTimer } from "./CodingTimer";
import { TerminalEnvironment } from "./TerminalEnvironment";
import { judgeApi, interviewApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";

interface CodingEnvironmentProps {
  question: Question;
  sessionId: string;
  onSubmit: (result: { evaluation: CodeEvaluation; next_question: Question | null }) => void;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function ScorePill({ label, value, max = 100, color = "accent" }: {
  label: string; value: number | null; max?: number;
  color?: "accent" | "emerald" | "amber" | "red";
}) {
  const cls = {
    accent:  "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    amber:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
    red:     "bg-red-500/15 text-red-300 border-red-500/30",
  }[color];
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${cls}`}>
      <div className="text-lg font-bold font-mono">
        {value === null ? "—" : value}<span className="text-xs opacity-60">/{max}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "Accepted" || status === "Finished";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
      ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

// ── Test-case result component ────────────────────────────────────────────────

function TestCaseRow({ tc, index, defaultOpen = false }: {
  tc: TestCaseResult;
  index: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const icon = tc.execution_error
    ? <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
    : tc.passed === true
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    : <XCircle className="h-3.5 w-3.5 text-red-400" />;

  const badgeClass = tc.execution_error
    ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
    : tc.passed === true
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
    : "bg-red-500/10 text-red-300 border-red-500/20";

  const label = tc.execution_error
    ? "Service Error"
    : tc.passed === true
    ? "Passed"
    : "Failed";

  return (
    <div className={`rounded-lg border ${badgeClass} overflow-hidden`}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        {icon}
        <span className="text-xs font-medium flex-1">Test Case {index + 1}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badgeClass}`}>
          {label}
        </span>
        {tc.time && (
          <span className="text-[10px] text-slate-600 font-mono">{tc.time}s</span>
        )}
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-3 pb-3 pt-2 space-y-2 font-mono text-xs">
              {tc.execution_error ? (
                <div className="rounded bg-amber-500/10 px-3 py-2 text-amber-300">
                  <div className="font-semibold mb-1">⚠ Execution Service Error</div>
                  <div className="text-amber-400/80">{tc.status}</div>
                  {tc.stderr && <div className="mt-1 text-slate-400">{tc.stderr}</div>}
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Input</div>
                    <pre className="rounded bg-black/30 px-2 py-1.5 text-slate-300 overflow-x-auto whitespace-pre-wrap">
                      {tc.input || "(empty)"}
                    </pre>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Expected</div>
                      <pre className="rounded bg-emerald-500/5 border border-emerald-500/20 px-2 py-1.5 text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                        {tc.expected || "(empty)"}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Output</div>
                      <pre className={`rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap ${
                        tc.passed
                          ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-300"
                          : "bg-red-500/5 border border-red-500/20 text-red-300"
                      }`}>
                        {tc.actual || "(no output)"}
                      </pre>
                    </div>
                  </div>
                  {tc.stderr && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Error</div>
                      <pre className="rounded bg-red-500/5 border border-red-500/20 px-2 py-1.5 text-red-300 overflow-x-auto whitespace-pre-wrap">
                        {tc.stderr}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Run Code results panel ────────────────────────────────────────────────────

function RunTestsPanel({ result }: { result: RunTestsResult }) {
  if (result.execution_error && result.results.length === 0) {
    // Pure service error — no test cases ran at all
    const isAuth = result.error_code === "AUTHENTICATION_ERROR";
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-amber-300 mb-1">
              Execution Service Error
            </div>
            <p className="text-xs text-amber-400/80 leading-relaxed">
              {result.error_message || "The code execution service is temporarily unavailable."}
            </p>
            {isAuth && (
              <p className="mt-2 text-xs text-slate-500">
                (Server configuration issue — not a code error. Contact support.)
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const passed  = result.tests_passed;
  const total   = result.tests_total;
  const allPass = passed === total && total > 0 && !result.execution_error;
  const anyErr  = result.execution_error;

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
        anyErr
          ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
          : allPass
          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
          : "bg-red-500/10 border-red-500/25 text-red-300"
      }`}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {anyErr
            ? <AlertCircle className="h-4 w-4" />
            : allPass
            ? <CheckCircle2 className="h-4 w-4" />
            : <XCircle className="h-4 w-4" />}
          {anyErr
            ? "Execution Service Error"
            : `${passed} / ${total} test cases passed`}
        </span>
        {!anyErr && total > 0 && (
          <span className="text-xs font-mono opacity-75">
            {Math.round(result.pass_rate * 100)}%
          </span>
        )}
      </div>

      {/* Per-test-case rows */}
      <div className="space-y-1.5">
        {result.results.map((tc, i) => (
          <TestCaseRow
            key={i}
            tc={tc}
            index={i}
            defaultOpen={tc.passed === false || tc.execution_error}
          />
        ))}
      </div>

      {/* Service error banner at bottom (when some tests ran but execution_error) */}
      {anyErr && result.results.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2">
          <p className="text-xs text-amber-400/80">
            ⚠ Some test cases could not be evaluated due to an execution service error.
            Your code has not been penalised for this.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CodingEnvironment({ question, sessionId, onSubmit }: CodingEnvironmentProps) {
  const problem = question.coding_problem as CodingProblem;
  const timeLimit = problem?.time_limit_minutes ?? 35;

  const [language, setLanguage]           = useState("python");
  const [code, setCode]                   = useState(problem?.starter_code?.[language] ?? "");
  const [stdin, setStdin]                 = useState("");
  const [runResult, setRunResult]         = useState<CodeRunResult | null>(null);
  const [runTestsResult, setRunTestsResult] = useState<RunTestsResult | null>(null);
  const [isRunning, setIsRunning]         = useState(false);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [evaluation, setEvaluation]       = useState<CodeEvaluation | null>(null);
  const [explanation, setExplanation]     = useState("");
  const [timerPaused, setTimerPaused]     = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [activeTab, setActiveTab]         = useState<"tests" | "io" | "terminal">("tests");
  const [theme, setTheme]                 = useState<"vs-dark" | "vs-light">("vs-dark");
  const [currentHint, setCurrentHint]     = useState<string | null>(null);

  const startTimeRef = useRef<number>(Date.now());
  const codeRef = useRef(code);
  const langRef = useRef(language);
  const hintsGivenRef = useRef<string[]>([]);

  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { langRef.current = language; }, [language]);

  const playHintAudio = async (text: string) => {
    try {
      const response = await interviewApi.tts(sessionId, text);
      const blob = new Blob([response.data], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (err) {
      console.error("TTS failed:", err);
    }
  };

  useEffect(() => {
    if (timerPaused || isSubmitting) return;

    const fetchHint = async () => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      try {
        const { data } = await interviewApi.codeHint(sessionId, {
          question_id: question.id,
          language: langRef.current,
          code: codeRef.current,
          elapsed_seconds: elapsed,
          hints_given: hintsGivenRef.current,
        });

        if (data.hint_type !== "COOLDOWN" && data.hint_text) {
          if (!hintsGivenRef.current.includes(data.hint_type)) {
            hintsGivenRef.current.push(data.hint_type);
          }
          if (data.should_speak) {
            setCurrentHint(data.hint_text);
            playHintAudio(data.hint_text);
            setTimeout(() => setCurrentHint(null), 10000); // Hide after 10s
          }
        }
      } catch (err) {
        console.error("Hint polling failed:", err);
      }
    };

    // 1. Regular active polling every 45 seconds
    const intervalId = setInterval(fetchHint, 45_000);

    // 2. Idle detector: If they stop typing for 30 seconds, trigger a proactive hint
    const idleTimeoutId = setTimeout(() => {
      // Don't trigger if they just started (give them time to read the problem)
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (elapsed > 45) {
        fetchHint();
      }
    }, 30_000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(idleTimeoutId);
    };
  }, [sessionId, question.id, timerPaused, isSubmitting, code]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "vs-dark" ? "vs-light" : "vs-dark"));
  };

  // Switch language → update starter code if editor is untouched / still at starter
  const handleLanguageChange = (lang: string) => {
    const current = problem?.starter_code?.[language] ?? "";
    const isUnchanged = code === current || code.trim() === "";
    setLanguage(lang);
    if (isUnchanged) {
      setCode(problem?.starter_code?.[lang] ?? "");
    }
  };

  // ── Run Code: execute against all visible test cases ─────────────────────
  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setRunTestsResult(null);
    try {
      const { data } = await judgeApi.runTests({
        question_id: question.id,
        language,
        code,
      });
      setRunTestsResult(data);
      setActiveTab("tests");
    } catch (err) {
      // Surface the error as a service-error result, not a wrong answer
      setRunTestsResult({
        tests_passed: 0,
        tests_total: 0,
        evaluated_total: 0,
        pass_rate: 0,
        execution_error: true,
        error_code: "NETWORK_ERROR",
        error_message: extractErrorMessage(err),
        results: [],
      });
      setActiveTab("tests");
    } finally {
      setIsRunning(false);
    }
  }, [question.id, language, code]);

  // ── Custom stdin run ─────────────────────────────────────────────────────
  const handleCustomRun = useCallback(async () => {
    setIsRunning(true);
    setRunResult(null);
    try {
      const { data } = await judgeApi.run({ language, code, stdin });
      setRunResult(data);
    } catch (err) {
      setRunResult({
        stdout: null,
        stderr: extractErrorMessage(err),
        compile_error: null,
        status: "Error",
        time: null,
        memory: null,
        execution_error: true,
        error_message: extractErrorMessage(err),
      });
    } finally {
      setIsRunning(false);
    }
  }, [language, code, stdin]);

  const handleSubmit = useCallback(async (fromTimer = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setTimerPaused(true);
    setSubmitError(null);
    try {
      const { data } = await interviewApi.submitCode(sessionId, {
        question_id: question.id,
        language,
        code: fromTimer ? code : code,
        approach_explanation: explanation,
      });
      setEvaluation(data.evaluation);
      // Short pause so the user can read the evaluation overlay
      await new Promise((r) => setTimeout(r, 3500));
      onSubmit({ evaluation: data.evaluation, next_question: data.next_question });
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
      setTimerPaused(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, sessionId, question.id, language, code, explanation, onSubmit]);

  const handleTimerExpired = useCallback(() => {
    handleSubmit(true);
  }, [handleSubmit]);

  if (!problem) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Problem data not available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden relative">
      {/* ── Evaluation overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {evaluation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-2xl rounded-2xl border border-white/10 bg-base-900 p-8 shadow-2xl"
            >
              {/* Execution service error overlay */}
              {(evaluation as any).execution_service_error ? (
                <div className="text-center">
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                    <h2 className="text-xl font-bold text-amber-300">Execution Service Error</h2>
                  </div>
                  <p className="text-sm text-slate-400 mb-4">{evaluation.feedback}</p>
                  <p className="text-xs text-slate-500">
                    Your code was submitted and saved. Your interview score was not affected by this error.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-6 text-center">
                    <div className="mb-2 text-4xl font-bold text-accent-400">
                      {evaluation.overall_score}<span className="text-xl text-slate-500">/100</span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {evaluation.tests_passed}/{evaluation.tests_total} test cases passed
                    </p>
                    <div className="mt-1 flex items-center justify-center gap-2 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      {evaluation.time_complexity}
                      <Layers className="ml-2 h-3 w-3" />
                      {evaluation.space_complexity}
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-4 gap-3">
                    <ScorePill label="Correctness" value={evaluation.correctness_score} color="emerald" />
                    <ScorePill label="Complexity"  value={evaluation.complexity_score}  color="accent" />
                    <ScorePill label="Quality"     value={evaluation.code_quality_score} color="amber" />
                    <ScorePill label="Readability" value={evaluation.readability_score}  color="accent" />
                  </div>

                  <p className="rounded-lg bg-white/5 px-4 py-3 text-sm text-slate-300 leading-relaxed">
                    {evaluation.feedback}
                  </p>
                </>
              )}

              <p className="mt-4 text-center text-xs text-slate-500 animate-pulse">
                Moving to follow-up questions…
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hint Bubble Overlay ────────────────────────────────────────────── */}
      <AnimatePresence>
        {currentHint && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-8 left-8 z-40 max-w-sm rounded-xl border border-accent-500/30 bg-base-900/90 p-4 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-accent-400">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-400">
                  AI Coach
                </h3>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {currentHint}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/8 bg-base-950/80 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/20">
            <Code2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{problem.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {problem.topics.map((t) => (
                <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-500 uppercase tracking-wide">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <CodingTimer
            totalMinutes={timeLimit}
            onExpired={handleTimerExpired}
            paused={timerPaused}
          />
          <button
            id="coding-submit-btn"
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-500 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {isSubmitting ? "Evaluating…" : "Submit"}
          </button>
        </div>
      </div>

      {/* ── Main split pane ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Problem statement */}
        <div className="w-[42%] overflow-y-auto border-r border-white/8 p-5 text-sm">
          {/* Description */}
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-slate-300 leading-relaxed">{problem.description}</p>
          </div>

          {/* Examples */}
          {problem.examples.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Examples
              </h3>
              <div className="space-y-3">
                {problem.examples.map((ex, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/8 p-3 font-mono text-xs">
                    <div>
                      <span className="text-slate-500">Input:  </span>
                      <span className="text-slate-200">{ex.input}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-slate-500">Output: </span>
                      <span className="text-emerald-400">{ex.output}</span>
                    </div>
                    {ex.explanation && (
                      <div className="mt-2 border-t border-white/8 pt-2 text-slate-500 font-sans">
                        {ex.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Constraints */}
          {problem.constraints.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Constraints
              </h3>
              <ul className="space-y-1">
                {problem.constraints.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-400">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Approach hint (collapsible) */}
          {problem.approach_hint && (
            <details className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-400">
                <Zap className="h-3.5 w-3.5" />
                Hint
                <ChevronDown className="ml-auto h-3.5 w-3.5" />
              </summary>
              <p className="mt-2 text-xs text-slate-400">{problem.approach_hint}</p>
            </details>
          )}
        </div>

        {/* Right: Editor + I/O */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Language selector + editor toolbar */}
          <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2">
            <div className="flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="rounded-md border border-white/10 bg-base-800 px-3 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <button
                onClick={toggleTheme}
                className="rounded-md border border-white/10 bg-base-800 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 transition-colors focus:outline-none focus:ring-1 focus:ring-accent-500"
              >
                {theme === "vs-dark" ? "Light Theme" : "Dark Theme"}
              </button>
            </div>
            <span className="ml-auto text-xs text-slate-600">Write a complete program — with imports, main(), and stdin reading</span>
          </div>

          {/* Monaco editor */}
          <div className="flex-1 overflow-hidden p-2">
            <CodeEditor language={language} value={code} onChange={setCode} theme={theme} />
          </div>

          {/* Bottom panel: Tabs */}
          <div className="flex flex-col border-t border-white/8 bg-base-950/50" style={{ height: "40vh", minHeight: "220px", maxHeight: "480px" }}>
            <div className="flex border-b border-white/8">
              {/* Tab: Test Cases */}
              <button
                id="tab-tests"
                onClick={() => setActiveTab("tests")}
                className={`px-4 py-2 text-xs font-medium tracking-wide uppercase transition-colors ${
                  activeTab === "tests"
                    ? "border-b-2 border-accent-500 text-accent-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Test Cases
              </button>
              {/* Tab: Custom I/O */}
              <button
                id="tab-io"
                onClick={() => setActiveTab("io")}
                className={`px-4 py-2 text-xs font-medium tracking-wide uppercase transition-colors ${
                  activeTab === "io"
                    ? "border-b-2 border-accent-500 text-accent-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Custom Input
              </button>
              {/* Tab: Terminal */}
              <button
                id="tab-terminal"
                onClick={() => setActiveTab("terminal")}
                className={`px-4 py-2 text-xs font-medium tracking-wide uppercase transition-colors ${
                  activeTab === "terminal"
                    ? "border-b-2 border-accent-500 text-accent-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Terminal
              </button>
            </div>

            <div className="flex-1 overflow-hidden">

              {/* ── Test Cases Tab ─────────────────────────────────────────────── */}
              {activeTab === "tests" && (
                <div className="flex h-full flex-col overflow-hidden">
                  {/* Run button + approach — always visible */}
                  <div className="flex items-start gap-3 shrink-0 px-3 pt-3 pb-2">
                    <button
                      id="coding-run-btn"
                      onClick={handleRun}
                      disabled={isRunning}
                      className="flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {isRunning ? "Running…" : "Run Code"}
                    </button>
                    <input
                      type="text"
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="Approach explanation (optional — helps the evaluator)"
                      className="flex-1 rounded bg-black/20 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                    />
                  </div>

                  {/* Scrollable results area */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                    {isRunning && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 animate-pulse py-1">
                        <Cpu className="h-3.5 w-3.5" />
                        Executing against test cases…
                      </div>
                    )}

                    {runTestsResult && !isRunning && (
                      <RunTestsPanel result={runTestsResult} />
                    )}

                    {!runTestsResult && !isRunning && (
                      <div className="flex items-center justify-center py-8 text-xs text-slate-600">
                        Click "Run Code" to execute against all visible test cases
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Custom Input Tab ───────────────────────────────────────────── */}
              {activeTab === "io" && (
                <div className="flex h-full flex-col overflow-y-auto p-3 gap-3">
                  <div className="shrink-0">
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-600">
                      Custom Input (stdin)
                    </label>
                    <textarea
                      rows={3}
                      value={stdin}
                      onChange={(e) => setStdin(e.target.value)}
                      placeholder="Enter custom input here…"
                      className="w-full resize-none rounded bg-black/20 px-3 py-1.5 font-mono text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                    />
                  </div>

                  <div className="flex items-start gap-3 shrink-0">
                    <button
                      onClick={handleCustomRun}
                      disabled={isRunning}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      {isRunning ? "Running…" : "Run with Input"}
                    </button>
                  </div>

                  {runResult && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={runResult.status} />
                        {runResult.time && (
                          <span className="text-[10px] text-slate-600">{runResult.time}s</span>
                        )}
                        {runResult.execution_error && (
                          <span className="text-[10px] text-amber-500">⚠ service error</span>
                        )}
                      </div>
                      <pre className="rounded bg-black/30 px-3 py-2 font-mono text-xs text-slate-300 overflow-x-auto max-h-36 whitespace-pre-wrap">
                        {runResult.compile_error
                          ? `Compile error:\n${runResult.compile_error}`
                          : runResult.stdout !== null && runResult.stdout !== ""
                          ? runResult.stdout
                          : runResult.stderr
                          ? `Error:\n${runResult.stderr}`
                          : "(no output)"}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* ── Terminal Tab ───────────────────────────────────────────────── */}
              {activeTab === "terminal" && (
                <div className="h-full w-full">
                  <TerminalEnvironment />
                </div>
              )}

            </div>

            {/* Submit error feedback */}
            {submitError && (
              <div className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400 shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {submitError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
