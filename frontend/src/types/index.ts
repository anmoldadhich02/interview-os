export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface CandidateProfile {
  skills: string[];
  projects: { name: string; description: string; technologies: string[] }[];
  experience: { company: string; role: string; duration: string; highlights: string[] }[];
  education: { institution: string; degree: string; year: string }[];
  achievements: string[];
  certifications: string[];
  seniority_estimate: string;
}

export interface GithubValidationEntry {
  project_name: string;
  repo_url: string | null;
  claimed_technologies: string[];
  detected_technologies: string[];
  status: "verified" | "partial" | "inconsistent" | "not_found";
  verified_technologies: string[];
  missing_technologies: string[];
  inconsistencies: string[];
  notes: string;
}

export interface GithubValidation {
  github_username: string | null;
  github_profile_url: string | null;
  repos_found: { name: string; url: string; description: string | null; language: string | null; stars: number }[];
  validation: GithubValidationEntry[];
  overall_verdict: string;
  credibility_score: number | null;
}

export interface Resume {
  id: string;
  original_filename: string;
  profile: CandidateProfile;
  github_validation?: GithubValidation | null;
  created_at: string;
}

// ── Coding round types ────────────────────────────────────────────────────────

export interface CodingExample {
  input: string;
  output: string;
  explanation: string;
}

export interface CodingProblem {
  title: string;
  description: string;
  constraints: string[];
  examples: CodingExample[];
  starter_code: Record<string, string>;   // { python: "...", cpp: "...", ... }
  time_limit_minutes: number;
  topics: string[];
  difficulty: string;
  approach_hint: string;
}

// ── Interview types ───────────────────────────────────────────────────────────

export interface InterviewSession {
  id: string;
  target_company: string;
  target_role: string;
  status: "planned" | "in_progress" | "completed";
  current_stage: string;
  current_difficulty: string;
  created_at: string;
}

export interface Question {
  id: string;
  stage: string;
  difficulty: string;
  text: string;
  is_followup: boolean;
  order_index: number;
  question_type: "voice" | "coding" | "mcq";   // ← includes mcq
  coding_problem?: CodingProblem | null;    // ← set when question_type === "coding"
  mcq_data?: { options: string[]; correct_option?: string; explanation?: string } | null;
  // Populated when the question was already answered (used to restore transcript on refresh)
  answer_text?: string | null;
  answer_evaluation?: Record<string, unknown> | null;
}

export interface Evaluation {
  // Core scoring
  technical_accuracy: number;
  completeness: number;
  confidence: number;
  communication: number;
  depth: number;
  overall_score: number;
  raw_llm_score: number;
  feedback: string;

  // Relevance
  relevance_classification: string;
  relevance_score: number;
  answers_current_question: boolean;
  score_cap: number;
  reason_for_score_cap?: string | null;

  // Narrative
  strengths: string[];
  missing_requirements: string[];

  // Follow-up
  should_follow_up: boolean;
  follow_up_reason?: string | null;
}

// ── Code evaluation ───────────────────────────────────────────────────────────

export interface CodeEvaluation {
  tests_passed: number;
  tests_total: number;
  // null = execution service error (not evaluated); 0 = wrong answer
  correctness_score: number | null;
  time_complexity: string;
  space_complexity: string;
  complexity_score: number;
  code_quality_score: number;
  readability_score: number;
  overall_score: number;
  feedback: string;
  approach: string;
  strengths: string[];
  issues: string[];
  optimal_approach: string;
  follow_up_questions: string[];
  should_follow_up: boolean;
  execution_service_error?: boolean;
  execution_error_code?: string | null;
}

export interface CodeRunResult {
  stdout: string | null;
  stderr: string | null;
  compile_error: string | null;
  status: string;
  time: string | null;
  memory: number | null;
  execution_error?: boolean;
  error_code?: string | null;
  error_message?: string | null;
}

// passed=true → correct, passed=false → wrong answer, passed=null → execution error (not evaluated)
export interface TestCaseResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean | null;
  status: string;
  stderr: string | null;
  time: string | null;
  execution_error: boolean;
}

export interface RunTestsResult {
  tests_passed: number;
  tests_total: number;
  evaluated_total: number;
  pass_rate: number;
  execution_error: boolean;
  error_code: string | null;
  error_message: string | null;
  results: TestCaseResult[];
}

export interface CodeHintResult {
  hint_text: string;
  hint_type: string;
  should_speak: boolean;
}

// ── Submit results ────────────────────────────────────────────────────────────

export interface SubmitAnswerResult {
  evaluation: Evaluation;
  next_question: Question | null;
  session_status: string;
  current_stage: string;
  current_difficulty: string;
}

export interface CodeSubmitResult {
  evaluation: CodeEvaluation;
  next_question: Question | null;
  session_status: string;
  current_stage: string;
  current_difficulty: string;
}

// ── Transcript ────────────────────────────────────────────────────────────────

export interface TranscriptTurn {
  question: Question;
  answerText: string;
  evaluation: Evaluation | CodeEvaluation;
  isCoding?: boolean;
}

// ── Rich report sub-types ─────────────────────────────────────────────────────

export interface ScoreCategory {
  category: string;
  score: number;
  max_score: number;
  explanation: string;
}

export interface StrengthInsight {
  strength: string;
  confidence: number;
  evidence: string;
  related_questions: string[];
}

export interface WeaknessInsight {
  topic: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  current_level: string;
  evidence: string;
  why_it_matters: string;
  how_to_improve: string;
}

export interface ImprovementInsight {
  focus: string;
  why: string;
  estimated_score_impact: string;
  next_action: string;
}

export interface QuestionAnalysis {
  question_number: number;
  stage: string;
  question: string;
  candidate_answer: string;
  score: number;
  relevance_classification: string;
  what_you_did_well: string;
  what_was_missing: string;
  why_points_were_lost: string;
  how_to_improve: string;
}

export interface AnswerPattern {
  primary_style: string;
  positive_effect: string;
  risk: string;
  recommendation: string;
}

export interface QuestionScore {
  question_number: number;
  question_short: string;
  score: number;
  stage: string;
  is_followup: boolean;
}

export interface DailyImprovementPlan {
  day: number;
  topic: string;
  goal: string;
  practice_task: string;
  expected_outcome: string;
}

export interface RadarAxis {
  axis: string;
  score: number;
}

export interface GitHubProjectInsights {
  verified_claims: string[];
  partial_claims: string[];
  claims_needing_explanation: string[];
  likely_interview_topics: string[];
  credibility_score: number | null;
  summary: string;
}

export interface PerformanceInsights {
  overall_pattern: string;
  strongest_pattern: string;
  weakest_pattern: string;
  follow_up_performance: string;
  answer_style: string;
  trend: "improving" | "declining" | "stable" | "mixed";
}

// ── Full Report ───────────────────────────────────────────────────────────────

export interface Report {
  id: string;
  session_id: string;
  created_at: string;

  overall_score: number;
  performance_level: string;
  executive_summary: string;

  readiness_score: number;
  readiness_level: string;
  readiness_explanation: string;

  technical_score: number;
  behavioral_score: number;
  communication_score: number;
  hiring_recommendation: string;
  summary: string;

  strengths_flat: string[];
  weaknesses_flat: string[];
  learning_plan: string[];

  performance_insights: PerformanceInsights | null;
  score_breakdown: ScoreCategory[];
  strengths: StrengthInsight[];
  weaknesses: WeaknessInsight[];
  highest_impact_improvement: ImprovementInsight | null;
  question_analyses: QuestionAnalysis[];
  answer_pattern: AnswerPattern | null;
  performance_timeline: QuestionScore[];
  seven_day_plan: DailyImprovementPlan[];
  readiness_radar: RadarAxis[];
  github_project_insights: GitHubProjectInsights | null;
}

export interface DashboardSummary {
  total_interviews: number;
  completed_interviews: number;
  average_score: number | null;
  recent_sessions: {
    id: string;
    target_company: string;
    target_role: string;
    status: string;
    created_at: string;
    overall_score: number | null;
  }[];
}

// ── Voice interview types ─────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'speaking' | 'listening' | 'processing';
