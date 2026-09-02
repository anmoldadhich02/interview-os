import { useState, useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle, HelpCircle, Timer, Zap } from "lucide-react";
import { interviewApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";
import type { Question } from "@/types";

interface McqEnvironmentProps {
  question: Question;
  sessionId: string;
  mcqIndex?: number;
  totalMcqs?: number;
  onSubmit: (result: any) => void;
}

const TOTAL_ROUND_SECONDS = 600; // 10 minutes

export function McqEnvironment({
  question,
  sessionId,
  mcqIndex = 1,
  totalMcqs = 20,
  onSubmit,
}: McqEnvironmentProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittedRef = useRef(false); // guard against double-submit

  // 10-Minute Rapid Round Countdown Timer (persisted in sessionStorage per session)
  const timerKey = `interview_mcq_timer_${sessionId}`;
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const saved = sessionStorage.getItem(timerKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return TOTAL_ROUND_SECONDS;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.max(0, prev - 1);
        sessionStorage.setItem(timerKey, next.toString());
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerKey]);

  // Reset selected option and submit guard when question changes
  useEffect(() => {
    setSelectedOption(null);
    setSubmitError(null);
    setIsSubmitting(false);
    submittedRef.current = false;
  }, [question.id]);

  const mcqData = question.mcq_data;

  // Extract options from mcq_data or fallback to parsing from question text
  let options = mcqData?.options || [];
  if (options.length === 0 && question.text) {
    const lines = question.text.split("\n");
    const parsedOptions: string[] = [];
    for (const line of lines) {
      if (/^[A-D][\.\)]\s+/i.test(line.trim())) {
        parsedOptions.push(line.trim());
      }
    }
    if (parsedOptions.length >= 2) {
      options = parsedOptions;
    }
  }

  // Keyboard shortcut support (A, B, C, D or 1, 2, 3, 4, and Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(key)) {
        const idx = key.charCodeAt(0) - 65;
        if (options[idx]) setSelectedOption(options[idx]);
      } else if (["1", "2", "3", "4"].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        if (options[idx]) setSelectedOption(options[idx]);
      } else if (e.key === "Enter" && selectedOption) {
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options, selectedOption, isSubmitting]);

  const handleSubmit = async () => {
    if (!selectedOption || isSubmitting || submittedRef.current) return;

    submittedRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { data } = await interviewApi.submitAnswer(sessionId, {
        question_id: question.id,
        text: selectedOption,
      });
      onSubmit({
        ...data,
        selected_option: selectedOption,
      });
    } catch (err: any) {
      // If backend says "already answered", the submit already succeeded —
      // don't block the user. The parent's onSubmit won't have next_question
      // but at least we don't freeze. Treat any other error normally.
      const detail = err?.response?.data?.detail || "";
      if (detail === "This question has already been answered.") {
        // Already went through — silently ignore, parent handles navigation
        return;
      }
      setSubmitError(extractErrorMessage(err));
      setIsSubmitting(false);
      submittedRef.current = false;
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isTimeCritical = timeLeft < 120; // under 2 minutes
  const progressPercent = Math.min(100, Math.round((mcqIndex / totalMcqs) * 100));

  return (
    <div className="flex min-h-screen w-full flex-col bg-base-950 text-slate-200">
      {/* Top Rapid Round Bar */}
      <div className="sticky top-0 z-20 border-b border-white/8 bg-base-950/90 px-6 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Zap className="h-3.5 w-3.5 fill-cyan-400" />
              Rapid Fire MCQ
            </span>
            <span className="hidden sm:inline text-xs text-slate-400">
              Question <span className="font-semibold text-white">{mcqIndex}</span> of {totalMcqs}
            </span>
          </div>

          {/* 10-Minute Countdown Clock */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-xs font-semibold ${
                isTimeCritical
                  ? "border-red-500/40 bg-red-500/10 text-red-400 animate-pulse"
                  : "border-white/10 bg-white/5 text-cyan-300"
              }`}
            >
              <Timer className="h-3.5 w-3.5" />
              <span>{formattedTime}</span>
              <span className="text-[10px] text-slate-400 font-sans font-normal ml-0.5">left</span>
            </div>
          </div>
        </div>

        {/* Rapid Round Progress Line */}
        <div className="mx-auto mt-2.5 max-w-4xl">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-12 max-w-4xl mx-auto w-full">
        {/* Stage Header / Question Text */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">
              Select one option • Use keys <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-slate-300">A-D</kbd> or <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-slate-300">1-4</kbd>
            </span>
            <span className="text-xs font-medium text-cyan-400/80 sm:hidden">
              {mcqIndex}/{totalMcqs}
            </span>
          </div>

          <h2 className="text-2xl md:text-3xl font-display font-semibold text-white leading-relaxed tracking-tight">
            {question.text.split("\nA)")[0].split("\nA.")[0]}
          </h2>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3.5">
          {options.length > 0 ? (
            options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const letter = String.fromCharCode(65 + idx);
              const cleanOptionText = option.replace(/^[A-D][\.\)]\s*/i, "");

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedOption(option)}
                  className={`group relative flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "border-cyan-400/80 bg-cyan-500/10 text-white shadow-[0_0_24px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/50 scale-[1.008]"
                      : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {/* Option Letter Indicator */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold transition-colors ${
                      isSelected
                        ? "bg-cyan-500 text-base-950 shadow-md font-bold"
                        : "border border-white/10 bg-white/5 text-slate-400 group-hover:border-white/20 group-hover:text-white"
                    }`}
                  >
                    {letter}
                  </div>

                  {/* Option Text */}
                  <span className="flex-1 text-sm md:text-base font-medium leading-relaxed">
                    {cleanOptionText || option}
                  </span>

                  {/* Selected check circle */}
                  {isSelected && (
                    <CheckCircle2 className="h-5 w-5 text-cyan-400 shrink-0 animate-in fade-in zoom-in-75 duration-150" />
                  )}
                </button>
              );
            })
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                The AI didn't generate options for this question. Please type your answer below to proceed.
              </div>
              <textarea
                value={selectedOption || ""}
                onChange={(e) => setSelectedOption(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200 outline-none transition-all focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
                rows={4}
              />
            </div>
          )}
        </div>

        {/* Error message */}
        {submitError && (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        {/* Submit button */}
        <div className="mt-10 flex items-center justify-between border-t border-white/8 pt-6">
          <span className="text-xs text-slate-500">
            {selectedOption ? (
              <span className="text-cyan-400/90 font-medium">
                Option selected • Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">Enter ↵</kbd> to submit
              </span>
            ) : (
              "Select an answer to continue"
            )}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedOption || isSubmitting}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-8 py-3 text-sm font-semibold text-base-950 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.25)]"
          >
            {isSubmitting ? "Submitting..." : mcqIndex === totalMcqs ? "Finish MCQ Round" : "Next Question →"}
          </button>
        </div>
      </div>
    </div>
  );
}

