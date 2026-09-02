import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileUp,
  Loader2,
  ArrowRight,
  CheckCircle2,
  FileText,
  Code2,
  Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { resumeApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";
import type { Resume } from "@/types";

export default function ResumeUpload() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (resume) {
      try {
        localStorage.setItem("interviewos_resume", JSON.stringify(resume));
      } catch { /* storage quota */ }
    }
  }, [resume]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const { data } = await resumeApi.upload(file);
      setResume(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 pt-24">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-display text-2xl font-bold text-white/90 tracking-tight">Upload your resume</h1>
        <p className="mt-1.5 text-sm text-white/35 leading-relaxed">
          The Resume Intelligence Agent extracts your skills, projects, and experience so every question is grounded in what you actually built.
        </p>
      </motion.div>

      {/* Drop zone */}
      <AnimatePresence mode="wait">
        {!resume && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition-all duration-300 ${
                dragActive
                  ? "border-accent-500/60 bg-accent-500/5 scale-[1.01]"
                  : uploading
                  ? "border-accent-500/30 bg-accent-500/3"
                  : "border-white/8 bg-base-900/30 hover:border-white/12 hover:bg-base-900/50"
              }`}
            >
              {/* Corner decorations */}
              <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-white/10" />
              <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-white/10" />
              <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-white/10" />
              <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-white/10" />

              {uploading ? (
                <>
                  <div className="relative mb-4">
                    <Loader2 className="h-8 w-8 animate-spin text-accent-400" />
                    <div
                      className="absolute inset-0 rounded-full opacity-30"
                      style={{ background: "radial-gradient(circle, rgba(99,102,241,0.4), transparent)", filter: "blur(8px)" }}
                    />
                  </div>
                  <p className="text-sm text-white/60 font-medium">Parsing your resume…</p>
                  <p className="mt-1 text-xs text-white/25">Extracting skills, projects, and seniority signals</p>
                </>
              ) : (
                <>
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/4 border border-white/6">
                    <FileUp className="h-5 w-5 text-white/35" />
                  </div>
                  <p className="text-sm font-medium text-white/70">Drop your resume here</p>
                  <p className="mt-1 text-xs text-white/25">or</p>
                  <label className="mt-3 cursor-pointer">
                    <span className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-400 transition-all duration-200 shadow-glow-sm">
                      Browse files
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      id="resume-file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                  </label>
                  <p className="mt-4 text-[11px] text-white/20 font-mono">PDF only · up to 10 MB</p>
                </>
              )}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-3 rounded-lg bg-red-500/8 border border-red-500/20 px-4 py-3"
              >
                <p className="text-xs text-red-400">{error}</p>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Profile card after upload */}
        {resume && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <Card variant="elevated">
              {/* Success header */}
              <div className="flex items-center gap-2.5 pb-5 border-b border-white/5 mb-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/80">Profile extracted</p>
                  <p className="text-[11px] text-white/30 font-mono">{resume.original_filename}</p>
                </div>
                <Badge tone="success" className="ml-auto">{resume.profile.seniority_estimate}</Badge>
              </div>

              {/* Skills */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Code2 className="h-3.5 w-3.5 text-white/25" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Skills detected</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {resume.profile.skills.slice(0, 20).map((s) => (
                    <Badge key={s} tone="accent">{s}</Badge>
                  ))}
                  {resume.profile.skills.length > 20 && (
                    <Badge tone="neutral">+{resume.profile.skills.length - 20} more</Badge>
                  )}
                </div>
              </div>

              {/* Projects */}
              {resume.profile.projects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="h-3.5 w-3.5 text-white/25" />
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Projects</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {resume.profile.projects.slice(0, 4).map((p) => (
                      <div key={p.name} className="rounded-xl border border-white/5 bg-white/2 px-4 py-3">
                        <p className="text-sm font-medium text-white/75">{p.name}</p>
                        {p.description && (
                          <p className="mt-0.5 text-xs text-white/30 leading-relaxed line-clamp-2">{p.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* CTA */}
            <Button
              className="mt-4 w-full gap-2"
              size="lg"
              onClick={() => navigate("/start", { state: { resume } })}
            >
              Continue to company selection
              <ArrowRight className="h-4 w-4" />
            </Button>

            {/* Re-upload link */}
            <button
              onClick={() => setResume(null)}
              className="mt-3 w-full text-center text-xs text-white/25 hover:text-white/45 transition-colors"
            >
              Upload a different resume
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
