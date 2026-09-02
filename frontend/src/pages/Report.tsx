import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Github,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
  Award,
  Flame,
  Shield,
  Activity,
  BarChart3,
  Lightbulb,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { reportApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";
import type {
  Report,
  QuestionAnalysis,
  WeaknessInsight,
  StrengthInsight,
  DailyImprovementPlan,
} from "@/types";

// ─── Config maps ──────────────────────────────────────────────────────────────

const recommendationTone: Record<string, "success" | "accent" | "warning" | "danger"> = {
  "Strong Hire": "success",
  Hire: "success",
  "Lean Hire": "accent",
  "No Hire": "warning",
  "Strong No Hire": "danger",
};

const severityTone: Record<string, "success" | "accent" | "warning" | "danger"> = {
  LOW: "accent",
  MEDIUM: "warning",
  HIGH: "danger",
};

const relevanceTone: Record<string, "success" | "accent" | "warning" | "danger" | "neutral"> = {
  DIRECTLY_RELEVANT: "success",
  PARTIALLY_RELEVANT: "accent",
  TANGENTIALLY_RELEVANT: "warning",
  IRRELEVANT: "danger",
  EMPTY: "neutral",
  SKIPPED: "neutral",
};

const relevanceLabel: Record<string, string> = {
  DIRECTLY_RELEVANT: "On-topic",
  PARTIALLY_RELEVANT: "Partial",
  TANGENTIALLY_RELEVANT: "Off-tangent",
  IRRELEVANT: "Off-topic",
  EMPTY: "Empty",
  SKIPPED: "Skipped",
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 55) return "text-amber-400";
  if (score >= 35) return "text-orange-400";
  return "text-red-400";
}

function scoreGradient(score: number): string {
  if (score >= 75) return "from-emerald-500/20 to-emerald-500/5";
  if (score >= 55) return "from-amber-500/20 to-amber-500/5";
  if (score >= 35) return "from-orange-500/20 to-orange-500/5";
  return "from-red-500/20 to-red-500/5";
}

function readinessColor(level: string): string {
  if (level.includes("Ready for challenging")) return "text-emerald-400";
  if (level.includes("Interview-ready")) return "text-accent-400";
  if (level.includes("focused")) return "text-amber-400";
  return "text-red-400";
}

function trendIcon(trend: string) {
  if (trend === "improving") return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (trend === "declining") return <TrendingDown className="h-4 w-4 text-red-400" />;
  return null;
}

// ─── Section: Hero Score Card ────────────────────────────────────────────────────
function HeroScoreSection({ report }: { report: Report }) {
  const hiringRecommendation = report.hiring_recommendation || "No Hire";
  const isStrongHire = hiringRecommendation.includes("Strong Hire");
  const isHire = hiringRecommendation.includes("Hire") && !hiringRecommendation.includes("No");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-base-700 bg-gradient-to-br from-base-900 via-base-800/50 to-base-900 p-8">
      {/* Background glow effect */}
      <div className={`absolute inset-0 bg-gradient-to-br ${scoreGradient(report.overall_score)} opacity-30`} />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-5 w-5 text-accent-400" />
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                Interview Performance Analysis
              </p>
            </div>
            <h1 className="font-display text-4xl font-bold text-slate-100">
              AI Engineer's Review
            </h1>
          </div>
          <Badge
            tone={recommendationTone[hiringRecommendation] ?? "neutral"}
            className="text-base px-4 py-2"
          >
            {isStrongHire && "🌟 "}
            {hiringRecommendation}
          </Badge>
        </div>

        {/* Score Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
          {/* Main Score */}
          <div className="flex items-end gap-6">
            <div>
              <p className={`font-display text-8xl font-black ${scoreColor(report.overall_score)} leading-none`}>
                {Math.round(report.overall_score)}
              </p>
              <p className="text-slate-500 text-lg mt-1">/100</p>
            </div>
            <div className="mb-3">
              {report.performance_level && (
                <p className="text-lg font-semibold text-slate-200 mb-1">
                  {report.performance_level}
                </p>
              )}
              <div className="flex items-center gap-2">
                {isHire ? (
                  <>
                    <Shield className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm text-emerald-400 font-medium">Interview Ready</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-amber-400 font-medium">Needs Improvement</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Micro Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Technical",
                score: report.technical_score,
                icon: Brain,
                color: "text-purple-400"
              },
              {
                label: "Behavioral",
                score: report.behavioral_score,
                icon: Activity,
                color: "text-blue-400"
              },
              {
                label: "Communication",
                score: report.communication_score,
                icon: Sparkles,
                color: "text-pink-400"
              },
            ].map(({ label, score, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border border-base-700 bg-base-900/50 p-4">
                <Icon className={`h-4 w-4 ${color} mb-2`} />
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${scoreColor(score)}`}>
                  {Math.round(score)}
                </p>
                <ProgressBar value={score} className="mt-2 h-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Executive Summary */}
        <div className="rounded-xl border border-accent-500/20 bg-accent-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-accent-400" />
            <p className="text-sm font-semibold text-accent-400 uppercase tracking-wide">
              Executive Summary
            </p>
          </div>
          <p className="text-base leading-relaxed text-slate-300">
            {report.executive_summary || report.summary || "Analysis complete. Review detailed insights below."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Enhanced Readiness Radar ─────────────────────────────────────────────────
function EnhancedRadarSection({ report }: { report: Report }) {
  const radarData = report.readiness_radar?.length
    ? report.readiness_radar.map((r) => ({
        metric: r.axis,
        value: Math.round(r.score),
        fullMark: 100
      }))
    : [
        { metric: "Technical", value: Math.round(report.technical_score), fullMark: 100 },
        { metric: "Behavioral", value: Math.round(report.behavioral_score), fullMark: 100 },
        { metric: "Communication", value: Math.round(report.communication_score), fullMark: 100 },
        { metric: "Problem Solving", value: Math.round(report.overall_score), fullMark: 100 },
      ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Radar Chart */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-purple-500/10 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-4 w-4 text-accent-400" />
            <p className="text-sm font-semibold text-slate-200">Competency Radar Analysis</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid
                  stroke="#374151"
                  strokeDasharray="3 3"
                />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 600 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 9 }}
                />
                <Radar
                  dataKey="value"
                  stroke="#8b8bfa"
                  fill="#6c63f7"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Readiness Card */}
      {report.readiness_level && (
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-accent-400" />
              <p className="text-sm font-semibold text-slate-200">Interview Readiness Level</p>
            </div>

            <div className="flex items-end gap-4 mb-4">
              <p className={`font-display text-6xl font-bold ${readinessColor(report.readiness_level)}`}>
                {Math.round(report.readiness_score)}
                <span className="text-2xl text-slate-500">/100</span>
              </p>
            </div>

            <div className="rounded-xl border border-base-700 bg-gradient-to-br from-accent-500/5 to-transparent p-4 mb-4">
              <p className={`text-lg font-semibold ${readinessColor(report.readiness_level)}`}>
                {report.readiness_level}
              </p>
            </div>

            {report.readiness_explanation && (
              <p className="text-sm leading-relaxed text-slate-400">
                {report.readiness_explanation}
              </p>
            )}
          </div>

          {/* Score Breakdown Meters */}
          {report.score_breakdown?.length > 0 && (
            <div className="mt-6 space-y-3">
              {report.score_breakdown.slice(0, 4).map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-400">{item.category}</span>
                    <span className={`font-bold ${scoreColor(item.score)}`}>
                      {Math.round(item.score)}/{item.max_score}
                    </span>
                  </div>
                  <ProgressBar value={item.score} max={item.max_score} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Section: Performance Timeline with Area Chart ───────────────────────────────────────
function EnhancedPerformanceTimeline({ report }: { report: Report }) {
  const timeline = report.performance_timeline || [];
  if (timeline.length < 2) return null;

  const chartData = timeline.map((t) => ({
    name: `Q${t.question_number}`,
    score: Math.round(t.score),
    followup: t.is_followup,
    avg: 60, // Reference average
  }));

  return (
    <Card className="col-span-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent-400" />
          <p className="text-sm font-semibold text-slate-200">Performance Trajectory</p>
        </div>
        <Badge tone="neutral" className="text-xs">
          {timeline.length} Questions Analyzed
        </Badge>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b8bfa" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b8bfa" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#242833" />
            <XAxis
              dataKey="name"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#374151" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#374151" }}
            />
            <Tooltip
              contentStyle={{
                background: "#111318",
                border: "1px solid #374151",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
              }}
              labelStyle={{ color: "#94a3b8", fontWeight: 600 }}
              itemStyle={{ color: "#8b8bfa" }}
            />
            <ReferenceLine
              y={60}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: "Average", fill: "#f59e0b", fontSize: 10 }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#8b8bfa"
              strokeWidth={3}
              fill="url(#scoreGradient)"
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#8b8bfa"
              strokeWidth={3}
              dot={{ fill: "#6c63f7", r: 4, strokeWidth: 2, stroke: "#1e293b" }}
              activeDot={{ r: 6, fill: "#a5b4fc" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Section: Strengths with Icons ───────────────────────────────────────────
function EnhancedStrengthsSection({ report }: { report: Report }) {
  const strengths: StrengthInsight[] = report.strengths?.length ? report.strengths : [];
  const flatFallback: string[] = report.strengths_flat || [];

  if (!strengths.length && !flatFallback.length) return null;

  return (
    <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
      <div className="flex items-center gap-2 mb-4">
        <Flame className="h-5 w-5 text-emerald-400" />
        <p className="text-base font-semibold text-emerald-400">Key Strengths Identified</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strengths.length > 0
          ? strengths.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 hover:border-emerald-500/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-none mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{s.strength}</p>
                    {s.evidence && (
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">{s.evidence}</p>
                    )}
                    {s.confidence > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar value={s.confidence} className="h-1 flex-1" />
                        <span className="text-[10px] text-emerald-400 font-medium">
                          {s.confidence}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          : flatFallback.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>{s}</span>
              </div>
            ))}
      </div>
    </Card>
  );
}

// ─── Section: Growth Areas with Action Items ─────────────────────────────────────────
function EnhancedWeaknessesSection({ report }: { report: Report }) {
  const weaknesses: WeaknessInsight[] = report.weaknesses?.length ? report.weaknesses : [];
  const flatFallback: string[] = report.weaknesses_flat || [];

  if (!weaknesses.length && !flatFallback.length) return null;

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <p className="text-base font-semibold text-amber-400">Growth Opportunities</p>
      </div>
      <div className="space-y-4">
        {weaknesses.length > 0
          ? weaknesses.map((w, i) => (
              <div
                key={i}
                className="rounded-xl border border-amber-500/20 bg-base-900/80 p-5 hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-amber-400" />
                    <p className="text-sm font-bold text-slate-100">{w.topic}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone[w.severity] ?? "neutral"} className="text-xs">
                      {w.severity}
                    </Badge>
                    {w.current_level && (
                      <span className="text-xs text-slate-500 font-medium">{w.current_level}</span>
                    )}
                  </div>
                </div>

                {w.evidence && (
                  <div className="mb-3 pl-6 border-l-2 border-amber-500/30">
                    <p className="text-xs text-slate-400 leading-relaxed">{w.evidence}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 mt-3">
                  {w.why_it_matters && (
                    <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-red-400 mb-1 font-semibold">
                        Impact
                      </p>
                      <p className="text-xs text-slate-300">{w.why_it_matters}</p>
                    </div>
                  )}
                  {w.how_to_improve && (
                    <div className="rounded-lg bg-accent-500/5 border border-accent-500/10 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-accent-400 mb-1 font-semibold">
                        Action Plan
                      </p>
                      <p className="text-xs text-slate-300">{w.how_to_improve}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          : flatFallback.map((w, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <TrendingDown className="mt-0.5 h-4 w-4 flex-none text-amber-400" />
                <span>{w}</span>
              </div>
            ))}
      </div>
    </Card>
  );
}

// ─── Section: Highest-Impact Focus ─────────────────────────────────────────
function HighestImpactSection({ report }: { report: Report }) {
  const imp = report.highest_impact_improvement;
  if (!imp?.focus) return null;

  return (
    <Card className="border-accent-500/30 bg-gradient-to-br from-accent-500/10 via-accent-500/5 to-transparent relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/20 rounded-full blur-3xl -z-10" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-accent-400" />
          <p className="text-base font-semibold text-accent-400">Priority Focus Area</p>
        </div>

        <div className="rounded-xl border border-accent-500/30 bg-base-900/50 p-6 mb-4">
          <p className="text-2xl font-bold text-slate-100 mb-3">{imp.focus}</p>
          {imp.why && (
            <p className="text-sm leading-relaxed text-slate-300">{imp.why}</p>
          )}
        </div>

        {imp.estimated_score_impact && (
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2">
              <p className="text-xs text-emerald-400 font-semibold">Potential Score Impact</p>
              <p className="text-lg font-bold text-emerald-400">{imp.estimated_score_impact}</p>
            </div>
          </div>
        )}

        {imp.next_action && (
          <div className="rounded-xl bg-accent-500/5 border border-accent-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="h-4 w-4 text-accent-400" />
              <p className="text-xs font-semibold text-accent-400 uppercase tracking-wide">
                Immediate Next Step
              </p>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{imp.next_action}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Section: Question-by-Question (Enhanced) ───────────────────────────────────────────
function QuestionAnalysisSection({ report }: { report: Report }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const analyses: QuestionAnalysis[] = report.question_analyses || [];
  if (!analyses.length) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-accent-400" />
        <p className="text-sm font-semibold text-slate-200">Detailed Question Breakdown</p>
      </div>
      <div className="space-y-2">
        {analyses.map((qa) => {
          const isOpen = expanded === qa.question_number;
          const relLabel = relevanceLabel[qa.relevance_classification] ?? qa.relevance_classification;
          const relTone = relevanceTone[qa.relevance_classification] ?? "neutral";
          return (
            <div key={qa.question_number} className="rounded-xl border border-base-700 overflow-hidden hover:border-base-600 transition-colors">
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left bg-base-900/30 hover:bg-base-800/50 transition-colors"
                onClick={() => setExpanded(isOpen ? null : qa.question_number)}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="flex-none flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/10 border border-accent-500/20 text-xs font-bold text-accent-400">
                    Q{qa.question_number}
                  </span>
                  <span className="text-sm text-slate-200 truncate flex-1">{qa.question}</span>
                </div>
                <div className="flex items-center gap-3 flex-none ml-4">
                  <Badge tone={relTone} className="text-xs">{relLabel}</Badge>
                  <div className="flex items-center gap-1">
                    <span className={`text-lg font-bold ${scoreColor(qa.score)}`}>
                      {Math.round(qa.score)}
                    </span>
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-4 bg-base-900/50 border-t border-base-700 space-y-3">
                  {qa.candidate_answer && (
                    <div className="rounded-lg bg-base-800/50 border border-base-700 p-4">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2 font-semibold">
                        Your Answer
                      </p>
                      <p className="text-sm leading-relaxed text-slate-300 italic">
                        "{qa.candidate_answer}"
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {qa.what_you_did_well && (
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">
                            Strengths
                          </p>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{qa.what_you_did_well}</p>
                      </div>
                    )}
                    {qa.what_was_missing && (
                      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                            Missing Elements
                          </p>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{qa.what_was_missing}</p>
                      </div>
                    )}
                  </div>

                  {qa.why_points_were_lost && (
                    <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                        <p className="text-[10px] uppercase tracking-wide text-red-400 font-semibold">
                          Score Deductions
                        </p>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{qa.why_points_were_lost}</p>
                    </div>
                  )}

                  {qa.how_to_improve && (
                    <div className="rounded-lg bg-accent-500/5 border border-accent-500/20 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-3.5 w-3.5 text-accent-400" />
                        <p className="text-[10px] uppercase tracking-wide text-accent-400 font-semibold">
                          Improvement Recommendations
                        </p>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{qa.how_to_improve}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Section: 7-Day Plan with Timeline ─────────────────────────────────────────────────
function SevenDayPlanSection({ report }: { report: Report }) {
  const plan: DailyImprovementPlan[] = report.seven_day_plan || [];
  const flatFallback: string[] = report.learning_plan || [];

  if (!plan.length && !flatFallback.length) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-accent-400" />
        <p className="text-sm font-semibold text-slate-200">7-Day Transformation Roadmap</p>
      </div>
      <div className="space-y-3">
        {plan.length > 0
          ? plan.map((day, idx) => (
              <div
                key={day.day}
                className="relative rounded-xl border border-base-700 bg-base-900/30 p-5 hover:border-accent-500/30 hover:bg-base-900/50 transition-all group"
              >
                {/* Day number badge */}
                <div className="absolute -left-3 top-5 flex items-center justify-center w-10 h-10 rounded-full bg-accent-500 border-4 border-base-900 shadow-lg">
                  <span className="text-sm font-bold text-white">{day.day}</span>
                </div>

                {/* Connecting line (except last item) */}
                {idx < plan.length - 1 && (
                  <div className="absolute left-2 top-14 w-0.5 h-[calc(100%+0.75rem)] bg-gradient-to-b from-accent-500/50 to-transparent" />
                )}

                <div className="pl-10">
                  <p className="text-base font-semibold text-slate-100 mb-2">{day.topic}</p>
                  {day.goal && (
                    <p className="text-sm text-slate-400 mb-3 leading-relaxed">{day.goal}</p>
                  )}

                  <div className="grid grid-cols-1 gap-2">
                    {day.practice_task && (
                      <div className="rounded-lg bg-accent-500/5 border border-accent-500/10 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-accent-400 mb-1 font-semibold">
                          Practice Task
                        </p>
                        <p className="text-xs text-slate-300">{day.practice_task}</p>
                      </div>
                    )}
                    {day.expected_outcome && (
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-emerald-400 mb-1 font-semibold">
                          Expected Outcome
                        </p>
                        <p className="text-xs text-slate-300">{day.expected_outcome}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          : flatFallback.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <ArrowRight className="mt-0.5 h-4 w-4 flex-none text-accent-400" />
                <span>{item}</span>
              </div>
            ))}
      </div>
    </Card>
  );
}

// ─── Section: Answer Pattern & Performance Insights ─────────────────────────────────────────────────
function AnswerPatternSection({ report }: { report: Report }) {
  const ap = report.answer_pattern;
  const pi = report.performance_insights;
  if (!ap?.primary_style && !pi?.overall_pattern) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-accent-400" />
        <p className="text-sm font-semibold text-slate-200">Communication Style Analysis</p>
      </div>

      {ap?.primary_style && (
        <div className="rounded-xl border border-accent-500/20 bg-accent-500/5 p-4 mb-4">
          <p className="text-xs text-accent-400 font-semibold uppercase tracking-wide mb-1">
            Primary Style
          </p>
          <p className="text-lg font-semibold text-slate-100">{ap.primary_style}</p>
        </div>
      )}

      {pi && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {[
            { label: "Strongest Area", value: pi.strongest_pattern, color: "emerald" },
            { label: "Area for Growth", value: pi.weakest_pattern, color: "amber" },
            { label: "Follow-up Response", value: pi.follow_up_performance, color: "blue" },
            { label: "Overall Trend", value: pi.trend, icon: trendIcon(pi.trend), color: "purple" },
          ].map(
            ({ label, value, icon, color }) =>
              value ? (
                <div key={label} className={`rounded-lg bg-${color}-500/5 border border-${color}-500/10 p-3`}>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    {icon}
                    <span>{value}</span>
                  </div>
                </div>
              ) : null
          )}
        </div>
      )}

      {(ap?.positive_effect || ap?.risk) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {ap.positive_effect && (
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 mb-2 font-semibold">
                Positive Impact
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">{ap.positive_effect}</p>
            </div>
          )}
          {ap.risk && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4">
              <p className="text-[10px] uppercase tracking-wide text-amber-400 mb-2 font-semibold">
                Watch Out For
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">{ap.risk}</p>
            </div>
          )}
        </div>
      )}

      {ap?.recommendation && (
        <div className="rounded-lg bg-accent-500/5 border border-accent-500/15 p-4">
          <p className="text-[10px] uppercase tracking-wide text-accent-400 mb-2 font-semibold">
            AI Recommendation
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{ap.recommendation}</p>
        </div>
      )}
    </Card>
  );
}

// ─── Section: GitHub Project Confidence ──────────────────────────────────────
function GitHubInsightsSection({ report }: { report: Report }) {
  const gh = report.github_project_insights;
  if (!gh) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-200">Project Claims Verification</p>
        </div>
        {gh.credibility_score != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Credibility Score</span>
            <span className={`text-2xl font-bold ${scoreColor(gh.credibility_score)}`}>
              {gh.credibility_score}
            </span>
          </div>
        )}
      </div>

      {gh.summary && (
        <p className="text-sm leading-relaxed text-slate-400 mb-4">{gh.summary}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gh.verified_claims.length > 0 && (
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-400 mb-3 font-semibold">
              ✓ Verified Claims
            </p>
            <div className="space-y-2">
              {gh.verified_claims.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-400" />
                  <p className="text-xs text-slate-300">{c}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {gh.partial_claims.length > 0 && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4">
            <p className="text-xs uppercase tracking-wide text-amber-400 mb-3 font-semibold">
              ~ Partially Verified
            </p>
            <div className="space-y-2">
              {gh.partial_claims.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-400" />
                  <p className="text-xs text-slate-300">{c}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {gh.claims_needing_explanation.length > 0 && (
          <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-4">
            <p className="text-xs uppercase tracking-wide text-red-400 mb-3 font-semibold">
              ⚠ Needs Clarification
            </p>
            <div className="space-y-2">
              {gh.claims_needing_explanation.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-red-400" />
                  <p className="text-xs text-slate-300">{c}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {gh.likely_interview_topics.length > 0 && (
          <div className="rounded-lg bg-accent-500/5 border border-accent-500/15 p-4">
            <p className="text-xs uppercase tracking-wide text-accent-400 mb-3 font-semibold">
              Expected Topics
            </p>
            <div className="space-y-2">
              {gh.likely_interview_topics.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-none text-accent-400" />
                  <p className="text-xs text-slate-300">{c}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Main Report Page ─────────────────────────────────────────────────────────
export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ["report", sessionId],
    queryFn: () => reportApi.get(sessionId!).then((r) => r.data),
    enabled: !!sessionId,
    retry: 1,
  });

  // ── Loading state
  if (isLoading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-accent-400" />
          <Brain className="absolute inset-0 m-auto h-6 w-6 text-accent-300 animate-pulse" />
        </div>
        <p className="text-base font-semibold text-slate-200">
          AI Engineer Analyzing Your Performance
        </p>
        <p className="text-sm text-slate-400">
          Generating comprehensive insights and personalized recommendations...
        </p>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse" />
          <div className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse delay-150" />
          <div className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse delay-300" />
        </div>
      </div>
    );
  }

  // ── Error / not-found state
  if (error || !report) {
    const message = error ? extractErrorMessage(error) : "Your interview report is not available yet.";
    const isNotYet = message.toLowerCase().includes("not generated") || message.toLowerCase().includes("not available");
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
        <p className="mt-4 text-xl font-semibold text-slate-200">
          {isNotYet ? "Report Not Available Yet" : "Could Not Load Report"}
        </p>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
          <Button onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Report available - WITH PROPER TOP PADDING TO AVOID NAVBAR OVERLAP
  return (
    <div className="min-h-screen bg-base-950">
      {/* Container with top padding to clear navbar */}
      <div className="mx-auto max-w-6xl px-6 pt-24 pb-16">
        {/* Page header with timestamp */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Clock className="h-3.5 w-3.5" />
            <span>Generated {new Date(report.created_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}</span>
          </div>
        </div>

        <div className="space-y-6">
          {/* 1. Hero Score Card */}
          <HeroScoreSection report={report} />

          {/* 2. Enhanced Readiness + Radar */}
          <EnhancedRadarSection report={report} />

          {/* 3. Performance Timeline */}
          <EnhancedPerformanceTimeline report={report} />

          {/* 4. Strengths + Weaknesses Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EnhancedStrengthsSection report={report} />
            <EnhancedWeaknessesSection report={report} />
          </div>

          {/* 5. Highest-Impact Focus */}
          <HighestImpactSection report={report} />

          {/* 6. Question-by-Question */}
          <QuestionAnalysisSection report={report} />

          {/* 7. Answer Pattern */}
          <AnswerPatternSection report={report} />

          {/* 8. 7-Day Plan */}
          <SevenDayPlanSection report={report} />

          {/* 9. GitHub Project Confidence */}
          <GitHubInsightsSection report={report} />
        </div>

        {/* Bottom nav with spacing */}
        <div className="mt-12 flex justify-center gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate("/dashboard")}
            className="px-6"
          >
            Back to Dashboard
          </Button>
          <Button
            onClick={() => window.print()}
            className="px-6"
          >
            <Sparkles className="h-4 w-4" /> Export Report
          </Button>
        </div>
      </div>
    </div>
  );
}
