import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Brain,
  GitBranch,
  Layers,
  Radar,
  Zap,
  ChevronRight,
  Code2,
  BarChart3,
  MessageSquare,
  Users,
  FileText,
  CheckCircle2
} from "lucide-react";
import { View } from "@react-three/drei";
import { AICore } from "@/components/3d/AICore";
import { Button } from "@/components/ui/Button";
import { TiltCard } from "@/components/ui/TiltCard";

// ─── Ambient Particle Field ────────────────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    // Reduced, sparse particles
    const N = Math.min(40, Math.floor((W * H) / 28000));
    type Particle = {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; depth: number;
    };

    const particles: Particle[] = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15,
      vy: Math.random() * 0.12 + 0.04,
      size: Math.random() * 1.5 + 0.4,
      opacity: Math.random() * 0.4 + 0.08,
      depth: Math.random(),
    }));

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    window.addEventListener("mousemove", handleMouse);

    let frame = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;

      // Mouse light — neutral only
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      if (mx > 0 && my > 0) {
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, 260);
        grad.addColorStop(0, "rgba(255,255,255,0.015)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      particles.forEach((p, i) => {
        // Subtle mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && mx > 0) {
          const force = (120 - dist) / 120 * 0.15;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        p.vx *= 0.98;
        p.vy *= 0.98;
        p.vy += (Math.random() - 0.5) * 0.003;

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.y < -10) p.y = H + 10;

        // Pulse opacity
        const pulse = Math.sin(frame * 0.015 + i * 0.7) * 0.15;
        const alpha = Math.max(0, Math.min(1, p.opacity + pulse));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        // Neutral white particles — no color tint
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.55})`;
        ctx.fill();

        // Faint connection lines — neutral
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 90) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 90) * 0.025})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    const onResize = () => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

// ─── Animated Interview Console ────────────────────────────────────────────────
const INTERVIEW_LINES = [
  { role: "sys",  text: "Analyzing resume → 4 projects · FastAPI · Python · ML pipeline", delay: 0 },
  { role: "ai",   text: "I saw you built a resume analyzer with FastAPI. Walk me through the architecture.", delay: 0.8 },
  { role: "user", text: "Sure — it's a FastAPI service that extracts text from uploaded PDFs, runs the content through an LLM to structure it into a profile object...", delay: 1.6 },
  { role: "ai",   text: "Why FastAPI specifically? Flask would have worked here.", delay: 2.8 },
  { role: "user", text: "FastAPI gives us async support natively — with multiple concurrent uploads, that matters a lot for throughput.", delay: 3.6 },
  { role: "ai",   text: "Good. What happens to your service at a million requests per day?", delay: 4.5 },
];

function AnimatedConsole() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= INTERVIEW_LINES.length) return;
    const timer = setTimeout(
      () => setVisibleLines((v) => v + 1),
      visibleLines === 0 ? 600 : INTERVIEW_LINES[visibleLines].delay * 1000 - (INTERVIEW_LINES[visibleLines - 1]?.delay ?? 0) * 1000
    );
    return () => clearTimeout(timer);
  }, [visibleLines]);

  const roleColor = (role: string) => {
    if (role === "ai")   return "text-accent-400";
    if (role === "user") return "text-white/80";
    return "text-white/30";
  };

  const roleLabel = (role: string) => {
    if (role === "ai")   return "interviewer";
    if (role === "user") return "you";
    return "system";
  };

  return (
    <div className="terminal-surface overflow-hidden relative">
      {/* Terminal chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/50" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/50" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-white/20 font-mono">interviewos · live session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="status-dot" />
          <span className="text-[10px] text-emerald-400/70 font-mono">active</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4 min-h-[280px] font-mono text-xs leading-relaxed">
        <AnimatePresence>
          {INTERVIEW_LINES.slice(0, visibleLines).map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={line.role === "sys" ? "flex items-start gap-2" : ""}
            >
              {line.role === "sys" ? (
                <>
                  <span className="text-white/20 shrink-0">›</span>
                  <span className="text-white/25">{line.text}</span>
                </>
              ) : (
                <>
                  <span className="text-white/20 mb-0.5 block">{roleLabel(line.role)}:</span>
                  <span className={roleColor(line.role)}>
                    {line.text}
                    {i === visibleLines - 1 && visibleLines < INTERVIEW_LINES.length && (
                      <span className="animate-pulse ml-0.5 text-accent-400">▋</span>
                    )}
                  </span>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Auto restart after all lines shown */}
        {visibleLines === 0 && (
          <div className="text-white/20 animate-pulse">Initializing session…</div>
        )}
      </div>

      {/* Scan line effect — neutral */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div
          className="absolute left-0 right-0 h-16 opacity-20"
          style={{
            background: "linear-gradient(transparent, rgba(255,255,255,0.03), transparent)",
            animation: "scanDown 6s linear infinite",
          }}
        />
      </div>
    </div>
  );
}

// ─── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon,
  title,
  body,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <TiltCard maxTilt={8} scaleOnHover={1.02} className="h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`h-full group relative rounded-2xl p-6 border transition-all duration-350 cursor-default ${
          accent
            ? "bg-accent-500/5 border-accent-500/15 hover:border-accent-500/30"
            : "bg-base-900/50 border-white/6 hover:border-white/12"
        }`}
      >
        {/* Top gradient line */}
        <div
          className={`absolute top-0 left-6 right-6 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${
            accent
              ? "bg-gradient-to-r from-transparent via-accent-500/50 to-transparent"
              : "bg-gradient-to-r from-transparent via-white/15 to-transparent"
          }`}
        />

        {/* Icon */}
        <div
          className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 ${
            accent
              ? "bg-accent-500/15 text-accent-400 group-hover:bg-accent-500/25"
              : "bg-white/5 text-white/50 group-hover:bg-white/8 group-hover:text-white/70"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>

        <h3 className="font-display font-semibold text-white/90 text-[15px] leading-snug mb-2 group-hover:text-white transition-colors duration-200">
          {title}
        </h3>
        <p className="text-sm text-white/45 leading-relaxed group-hover:text-white/55 transition-colors duration-200">
          {body}
        </p>
      </motion.div>
    </TiltCard>
  );
}

// ─── How It Works Step ─────────────────────────────────────────────────────────
function HowItWorksStep({
  step,
  title,
  desc,
  icon: Icon,
  delay = 0,
}: {
  step: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-start gap-4 group"
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-xl bg-base-800/80 border border-white/8 flex items-center justify-center group-hover:border-accent-500/30 transition-colors duration-300">
          <Icon className="h-4 w-4 text-white/40 group-hover:text-accent-400 transition-colors duration-300" />
        </div>
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-base-950 border border-white/10 flex items-center justify-center text-[9px] font-mono text-white/30 group-hover:text-accent-400 group-hover:border-accent-500/30 transition-all duration-300">
          {step}
        </span>
      </div>
      <div>
        <h4 className="font-semibold text-white/80 text-sm leading-tight mb-1 group-hover:text-white transition-colors duration-200">
          {title}
        </h4>
        <p className="text-xs text-white/35 leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

// ─── Stat Counter ─────────────────────────────────────────────────────────────
function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <p className="font-display text-3xl font-bold text-gradient">{value}</p>
      <p className="mt-1 text-xs text-white/35 font-medium">{label}</p>
    </motion.div>
  );
}

// ─── Main Landing Page ─────────────────────────────────────────────────────────
export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);

  const capabilities = [
    {
      icon: Layers,
      title: "Reads your resume like a hiring manager",
      body: "Extracts real projects, stack, and seniority signals — then interviews you on what you actually built, not a generic template.",
      accent: false,
    },
    {
      icon: Radar,
      title: "Adapts difficulty turn by turn",
      body: "Strong answer, next question gets harder. Shaky answer, it steps back. The way a real loop calibrates to find your ceiling.",
      accent: true,
    },
    {
      icon: GitBranch,
      title: "Follows up like a senior engineer",
      body: '"Why not Flask?" "What breaks at a million users?" The follow-up agent never lets a vague answer slide — it probes deeper.',
      accent: false,
    },
  ];

  const steps = [
    { step: "1", icon: FileTextIcon, title: "Upload your resume", desc: "Drop your PDF. The AI extracts projects, stack depth, and seniority signals in seconds." },
    { step: "2", icon: TargetIcon, title: "Pick your target", desc: "Select a company and role. InterviewOS calibrates question difficulty and domain accordingly." },
    { step: "3", icon: MessageSquare, title: "Live interview loop", desc: "Multi-stage: resume deep-dive, technical questions, follow-ups, and coding challenges." },
    { step: "4", icon: BarChart3, title: "Hiring committee report", desc: "A detailed breakdown of every answer — scored, analyzed, and with concrete improvement paths." },
  ];

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20"
      >
        {/* Particle background */}
        <ParticleField />

        {/* 3D Background Interactive Elements */}
        <div className="absolute inset-0 z-0">
          <View className="w-full h-full pointer-events-auto">
            <AICore />
          </View>
        </div>

        {/* Background atmospheric elements — neutral, no color */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {/* Subtle top vignette — neutral white only */}
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[400px] opacity-10"
            style={{
              background: "radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, transparent 65%)",
              filter: "blur(60px)",
            }}
          />
        </div>

        {/* Hero content */}
        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 mx-auto max-w-5xl px-6 text-center"
        >
          {/* Eyebrow tag */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 flex items-center justify-center"
          >
            <div className="eyebrow-tag">
              <Zap className="h-3 w-3" />
              Multi-agent interview engine
              <ChevronRight className="h-3 w-3 opacity-50" />
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="font-display font-bold leading-[1.05] tracking-tight text-white"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            The AI interviewer that
            <br />
            <span className="text-gradient">thinks like a senior engineer.</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-6 mx-auto max-w-xl text-base text-white/45 leading-relaxed"
          >
            Upload your resume, pick a target company, and InterviewOS runs a real technical
            loop — resume deep-dive, adaptive technical rounds, probing follow-ups, and a
            hiring-committee report at the end.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 flex items-center justify-center gap-3 flex-wrap"
          >
            <Link to="/register">
              <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-400 transition-all duration-200 active:scale-[0.98]">
                Start your interview
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <Link to="/login">
              <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 text-white/70 text-sm font-medium hover:bg-white/8 hover:text-white/90 border border-white/8 hover:border-white/15 transition-all duration-200 active:scale-[0.98]">
                I have an account
              </button>
            </Link>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-12 flex items-center justify-center gap-6 text-xs text-white/25"
          >
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
              No credit card required
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span>Free to start</span>
            <span className="h-3 w-px bg-white/10" />
            <span>Works with your resume</span>
          </motion.div>
        </motion.div>

        {/* Hero visual — animated console */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="relative z-10 mx-auto mt-16 w-full max-w-2xl px-6 pb-24"
        >
          <AnimatedConsole />

          {/* Subtle shadow beneath console — neutral */}
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-16 opacity-20 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(20px)" }}
          />
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] text-white/20 font-medium tracking-widest uppercase">Scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent"
          />
        </motion.div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-12 grid grid-cols-3 gap-8 sm:gap-12">
          <StatItem value="6+" label="AI agents working together" />
          <StatItem value="Real" label="Technical depth per question" />
          <StatItem value="Live" label="Adaptive difficulty engine" />
        </div>
      </section>

      {/* ── Capabilities ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <div className="section-label mb-3">Capabilities</div>
          <h2 className="font-display text-3xl font-bold text-white/90 tracking-tight">
            Not a chatbot. A real interview loop.
          </h2>
          <p className="mt-3 text-sm text-white/35 max-w-md mx-auto leading-relaxed">
            Built on a network of specialized agents — each responsible for one part of the interview process.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <FeatureCard {...c} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section className="border-y border-white/4 bg-base-900/20">
        <div className="mx-auto max-w-6xl px-6 py-24 grid grid-cols-1 gap-16 lg:grid-cols-2 items-center">
          {/* Left: steps */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-10"
            >
              <div className="section-label mb-3">How it works</div>
              <h2 className="font-display text-3xl font-bold text-white/90 tracking-tight">
                From resume to report
                <br />
                <span className="text-gradient">in one session.</span>
              </h2>
              <p className="mt-3 text-sm text-white/35 leading-relaxed max-w-sm">
                Four stages. Fully automated. Adapted to exactly who you are and where you want to work.
              </p>
            </motion.div>

            <div className="space-y-7">
              {steps.map((s, i) => (
                <HowItWorksStep key={s.title} {...s} delay={i * 0.1} />
              ))}
            </div>
          </div>

          {/* Right: animated mockup */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <ReportMockup />
          </motion.div>
        </div>
      </section>

      {/* ── Live interview preview ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10 text-center"
        >
          <div className="section-label mb-3">See it in action</div>
          <h2 className="font-display text-3xl font-bold text-white/90 tracking-tight">
            Real questions. Real follow-ups.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6 }}
        >
          <FullConsolePreview />
        </motion.div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-[500px] h-[300px] opacity-[0.06]"
            style={{
              background: "radial-gradient(ellipse, rgba(255,255,255,0.3) 0%, transparent 65%)",
              filter: "blur(70px)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-2xl px-6 py-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="section-label mb-4">Ready to level up?</div>
            <h2 className="font-display text-4xl font-bold text-white leading-tight tracking-tight">
              Your next interview
              <br />
              <span className="text-gradient">starts here.</span>
            </h2>
            <p className="mt-4 text-sm text-white/35 max-w-sm mx-auto leading-relaxed">
              Upload your resume and start a real technical loop in under 60 seconds.
            </p>

            <div className="mt-8 flex items-center justify-center gap-3">
              <Link to="/register">
                <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-400 transition-all duration-200 active:scale-[0.98]">
                  Start an interview — it's free
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

// ─── Icon stubs ────────────────────────────────────────────────────────────────
function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" strokeLinecap="round" />
      <circle cx="12" cy="12" r="6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Report Mockup ─────────────────────────────────────────────────────────────
function ReportMockup() {
  const metrics = [
    { label: "Technical Depth", value: 78, color: "#22D3EE" },
    { label: "Communication", value: 85, color: "#34D399" },
    { label: "Problem Solving", value: 71, color: "#FBBF24" },
    { label: "System Design", value: 66, color: "#F87171" },
  ];

  return (
    <div className="terminal-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div>
          <p className="text-xs text-white/30 font-mono mb-1">evaluation report</p>
          <p className="text-sm font-semibold text-white/80">Senior Backend Engineer · Stripe</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gradient font-display">74</p>
          <p className="text-[10px] text-white/25 font-mono">/100</p>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-3">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 + 0.3, duration: 0.4 }}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-white/40 font-mono">{m.label}</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: m.color }}>{m.value}</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${m.value}%` }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 + 0.5, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="h-full rounded-full"
                style={{ background: m.color, boxShadow: `0 0 8px ${m.color}60` }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Key insight */}
      <div className="mt-2 rounded-lg bg-accent-500/8 border border-accent-500/15 p-3">
        <p className="text-[11px] text-white/35 leading-relaxed">
          <span className="text-accent-400 font-semibold">Key insight:</span>{" "}
          Strong on async architecture — struggled to define consistency guarantees in distributed systems.
        </p>
      </div>
    </div>
  );
}

// ─── Full Console Preview ──────────────────────────────────────────────────────
const PREVIEW_CONVERSATION = [
  { role: "sys",  text: "Technical Round 2 · System Design", mono: true },
  { role: "ai",   text: "Let's talk system design. How would you design a URL shortener that handles 100M URLs and 10B requests per day?" },
  { role: "user", text: "I'd start with a hash-based approach — take the long URL, generate a 6-character base62 hash, store the mapping in a distributed key-value store like DynamoDB..." },
  { role: "ai",   text: "Good. What happens when two URLs hash to the same 6 characters?" },
  { role: "user", text: "We'd get a collision. We can handle that with a retry — generate another hash by appending a counter or using a different seed." },
  { role: "ai",   text: "At 100M URLs, what's the probability of collision and how does it affect your write latency?" },
];

function FullConsolePreview() {
  return (
    <div className="terminal-surface">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/50" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/50" />
        </div>
        <span className="ml-2 text-xs text-white/20 font-mono">system design · example session</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="status-dot" />
          <span className="text-[10px] text-emerald-400/60 font-mono">live</span>
        </div>
      </div>

      <div className="p-5 space-y-4 font-mono text-xs leading-relaxed">
        {PREVIEW_CONVERSATION.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={{ delay: i * 0.15, duration: 0.3 }}
          >
            {line.role === "sys" ? (
              <div className="flex items-center gap-2 text-white/20">
                <span>›</span>
                <span>{line.text}</span>
              </div>
            ) : (
              <>
                <span className={`block text-[10px] mb-0.5 ${line.role === "ai" ? "text-white/25" : "text-white/20"}`}>
                  {line.role === "ai" ? "interviewer" : "you"}:
                </span>
                <span className={line.role === "ai" ? "text-accent-400" : "text-white/70"}>
                  {line.text}
                </span>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
