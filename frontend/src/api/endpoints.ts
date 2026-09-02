import { apiClient } from "./client";
import type {
  CodeRunResult,
  CodeSubmitResult,
  DashboardSummary,
  InterviewSession,
  Question,
  Report,
  Resume,
  SubmitAnswerResult,
  User,
} from "@/types";

export const authApi = {
  register: (data: { email: string; full_name: string; password: string }) =>
    apiClient.post<{ message: string; user_id: string }>("/api/auth/register", data),
  login: (data: { email: string; password: string }) =>
    apiClient.post<{ access_token: string }>("/api/auth/login", data),
  me: () => apiClient.get<User>("/api/auth/me"),
  updateProfile: (data: { full_name: string }) =>
    apiClient.put<User>("/api/auth/me", data),
};

export const resumeApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post<Resume>("/api/resumes/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  list: () => apiClient.get<Resume[]>("/api/resumes"),
  get: (id: string) => apiClient.get<Resume>(`/api/resumes/${id}`),
  getGithubValidation: (id: string) =>
    apiClient.get<{ status: "pending" | "complete"; data?: import("@/types").GithubValidation }>(
      `/api/resumes/${id}/github-validation`
    ),
};

export const interviewApi = {
  start: (data: { resume_id: string; target_company: string; target_role: string }) =>
    apiClient.post<InterviewSession>("/api/interviews/start", data),
  get: (id: string) => apiClient.get<InterviewSession>(`/api/interviews/${id}`),
  listQuestions: (id: string) => apiClient.get<Question[]>(`/api/interviews/${id}/questions`),

  /** Record a proctoring violation (e.g. tab switch) */
  recordViolation: (id: string) => 
    apiClient.post<{ status: string; tab_switches: number }>(`/api/interviews/${id}/violation`),

  /** Submit a voice answer. */
  submitAnswer: (id: string, data: { question_id: string; text: string }) =>
    apiClient.post<SubmitAnswerResult>(`/api/interviews/${id}/answer`, data),

  /** Submit code for the coding round. */
  submitCode: (
    id: string,
    data: { question_id: string; language: string; code: string; approach_explanation?: string }
  ) => apiClient.post<CodeSubmitResult>(`/api/interviews/${id}/code`, data),

  /** Convert question text → streaming MP3. */
  tts: (sessionId: string, questionText: string, voice = "alloy") =>
    apiClient.post(
      `/api/interviews/${sessionId}/tts`,
      { question_text: questionText, voice },
      { responseType: "blob" },
    ),

  /** Transcribe recorded audio blob → { transcript: string }. */
  stt: (sessionId: string, audioBlob: Blob) => {
    const formData = new FormData();
    const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("audio", audioBlob, `recording.${ext}`);
    return apiClient.post<{ transcript: string }>(
      `/api/interviews/${sessionId}/stt`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },

  /** Ask the AI for a live coding hint based on the current code. */
  codeHint: (
    sessionId: string,
    data: {
      question_id: string;
      language: string;
      code: string;
      elapsed_seconds: number;
      hints_given: string[];
    }
  ) =>
    apiClient.post<import("@/types").CodeHintResult>(
      `/api/interviews/${sessionId}/code-hint`,
      data
    ),
};

export const judgeApi = {
  /** Run code with optional custom stdin — used by custom-input tab. */
  run: (data: { language: string; code: string; stdin?: string }) =>
    apiClient.post<CodeRunResult>("/api/judge/run", { ...data, stdin: data.stdin ?? "" }),

  /**
   * Run code against ALL VISIBLE test cases for a question.
   * Used by the 'Run Code' button — returns per-test-case pass/fail breakdown.
   * Hidden test cases are never exposed.
   */
  runTests: (data: { question_id: string; language: string; code: string }) =>
    apiClient.post<import("@/types").RunTestsResult>("/api/judge/run-tests", data),
};

export const reportApi = {
  generate: (sessionId: string) => apiClient.post<Report>(`/api/reports/${sessionId}/generate`),
  get: (sessionId: string) => apiClient.get<Report>(`/api/reports/${sessionId}`),
};

export const dashboardApi = {
  summary: () => apiClient.get<DashboardSummary>("/api/dashboard/summary"),
};
