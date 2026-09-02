import axios from "axios";
import { useAuthStore } from "@/store/authStore";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Auto-logout on any 401, EXCEPT Judge0 endpoints — a Judge0 auth failure
    // must NOT silently kick the user out of their live interview session.
    const url: string = error.config?.url ?? "";
    const isJudgeEndpoint = url.includes("/api/judge/");
    if (error.response?.status === 401 && !isJudgeEndpoint) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    // FastAPI 422 validation errors: detail is an array of objects
    if (Array.isArray(detail)) {
      const first = detail[0];
      if (first && typeof first === "object") {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
        const msg = first.msg || "Validation error";
        return field ? `${field}: ${msg}` : msg;
      }
      return "Validation error";
    }
    if (typeof detail === "string") return detail;
    return error.message || "Something went wrong.";
  }
  return "Something went wrong.";
}
