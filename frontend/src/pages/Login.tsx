import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { authApi } from "@/api/endpoints";
import { extractErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/authStore";

interface FormValues {
  email: string;
  password: string;
}

export default function Login() {
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
      const { data } = await authApi.login(values);
      useAuthStore.getState().setAuth(data.access_token, { id: "", email: values.email, full_name: "" });
      const me = await authApi.me();
      setAuth(data.access_token, me.data);
      navigate("/dashboard");
    } catch (err) {
      setServerError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-16">
      {/* Very subtle neutral vignette — no color */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-[0.07]"
          style={{
            background: "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 65%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm"
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

        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-white/90 tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-white/35">Continue your interview prep.</p>
        </div>

        <Card variant="elevated" className="p-5">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              id="login-email"
              {...register("email", { required: "Email is required" })}
              error={formState.errors.email?.message}
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              id="login-password"
              {...register("password", { required: "Password is required" })}
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
              Log in <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-white/30">
          No account yet?{" "}
          <Link to="/register" className="text-accent-400 hover:text-accent-300 transition-colors font-medium">
            Create one →
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
