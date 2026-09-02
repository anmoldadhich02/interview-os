import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { authApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/authStore";

interface FormValues {
  full_name: string;
  email: string;
  password: string;
}

const PERKS = [
  "Resume intelligence — extracts your real skills & projects",
  "Adaptive difficulty — calibrates to your level in real time",
  "Senior-engineer follow-ups — no vague answer goes unchallenged",
  "Hiring committee report — detailed scoring and improvement plan",
];

export default function Register() {
  const { register, handleSubmit, formState } = useForm<FormValues>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    logout();
  }, [logout]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setLoading(true);
    try {
      // Step 1: create the account
      await authApi.register(values);
      // Step 2: auto-login to get the access token
      const { data: loginData } = await authApi.login({ email: values.email, password: values.password });
      useAuthStore.getState().setAuth(loginData.access_token, { id: "", email: values.email, full_name: values.full_name });
      // Step 3: fetch full user profile
      const me = await authApi.me();
      setAuth(loginData.access_token, me.data);
      navigate("/dashboard");
    } catch (err) {
      setServerError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 pt-24">
      {/* Very subtle neutral vignette — no color */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] opacity-[0.06]"
          style={{
            background: "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 65%)",
            filter: "blur(90px)",
          }}
        />
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left: marketing copy */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="hidden lg:block"
        >
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10">
              <Brain className="h-4 w-4 text-accent-400" />
            </div>
            <span className="font-display text-[15px] font-semibold text-white">
              Interview<span className="text-accent-400">OS</span>
            </span>
          </div>

          <h2 className="font-display text-3xl font-bold text-white/90 tracking-tight leading-tight mb-4">
            Your next interview
            <br />
            <span className="text-gradient">starts with one loop.</span>
          </h2>

          <p className="text-sm text-white/35 leading-relaxed mb-8 max-w-xs">
            Upload your resume and get a real technical interview — adapted to your projects, your stack, and your target company.
          </p>

          <div className="space-y-3">
            {PERKS.map((perk, i) => (
              <motion.div
                key={perk}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-start gap-2.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-xs text-white/45 leading-relaxed">{perk}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right: form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Logo on mobile */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10">
              <Brain className="h-4 w-4 text-accent-400" />
            </div>
            <span className="font-display text-[15px] font-semibold text-white">
              Interview<span className="text-accent-400">OS</span>
            </span>
          </div>

          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-white/90 tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-white/35">Start practicing with a real technical loop.</p>
          </div>

          <Card variant="elevated" className="p-5">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Input
                label="Full name"
                placeholder="Ada Lovelace"
                id="register-name"
                {...register("full_name", { required: "Name is required" })}
                error={formState.errors.full_name?.message}
              />
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                id="register-email"
                {...register("email", { required: "Email is required" })}
                error={formState.errors.email?.message}
              />
              <Input
                label="Password"
                type="password"
                placeholder="At least 8 characters"
                id="register-password"
                hint="Use at least 8 characters"
                {...register("password", {
                  required: "Password is required",
                  minLength: { value: 8, message: "At least 8 characters" },
                })}
                error={formState.errors.password?.message}
              />

              {serverError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2"
                >
                  <p className="text-xs text-red-400">{serverError}</p>
                </motion.div>
              )}

              <Button
                type="submit"
                loading={loading}
                className="mt-1 w-full gap-2"
                size="lg"
              >
                Create account <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </form>
          </Card>

          <p className="mt-5 text-center text-xs text-white/30">
            Already have an account?{" "}
            <Link to="/login" className="text-accent-400 hover:text-accent-300 transition-colors font-medium">
              Log in →
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
