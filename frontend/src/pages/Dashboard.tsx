import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  FileText,
  Target,
  TrendingUp,
  Plus,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { dashboardApi } from "@/api/endpoints";
import { useAuthStore } from "@/store/authStore";

const statusTone: Record<string, "neutral" | "accent" | "success"> = {
  planned: "neutral",
  in_progress: "accent",
  completed: "success",
};

const statusLabel: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

function StatCard({
  icon: Icon,
  label,
  value,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string | number | null | undefined;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <Card variant="elevated" className="relative overflow-hidden group">
        {/* Subtle top shine */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/40 group-hover:bg-accent-500/10 group-hover:text-accent-400 transition-all duration-300">
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-[10px] text-white/20 font-mono uppercase tracking-wide">{label}</span>
        </div>

        <div className="mt-4">
          <p className="font-display text-3xl font-bold text-white/90 tracking-tight">
            {value ?? <span className="animate-pulse text-white/20">—</span>}
          </p>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardApi.summary().then((r) => r.data),
  });
  const user = useAuthStore((s) => s.user);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 pt-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10"
      >
        <div>
          <p className="text-xs text-white/30 font-mono mb-1">
            {greeting()}{user ? `, ${user.full_name.split(" ")[0]}` : ""}
          </p>
          <h1 className="font-display text-2xl font-bold text-white/90 tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-white/35">Your interview practice at a glance.</p>
        </div>
        <Link to="/resume">
          <Button className="gap-2 shrink-0">
            <Plus className="h-3.5 w-3.5" />
            New interview
          </Button>
        </Link>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-10">
        <StatCard icon={Target}     label="Total sessions"   value={data?.total_interviews}     delay={0}    />
        <StatCard icon={FileText}   label="Completed"        value={data?.completed_interviews}  delay={0.08} />
        <StatCard icon={TrendingUp} label="Average score"    value={data?.average_score != null ? `${data.average_score}` : null} delay={0.16} />
      </div>

      {/* Divider */}
      <div className="hr-gradient mb-8" />

      {/* Recent interviews */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-white/80 text-base">Recent interviews</h2>
          <span className="text-xs text-white/25 font-mono">
            {data?.recent_sessions?.length ?? 0} sessions
          </span>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl shimmer bg-white/3" />
            ))}
          </div>
        )}

        {!isLoading && (data?.recent_sessions?.length ?? 0) === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card variant="flat" className="text-center py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/4 flex items-center justify-center">
                  <Target className="h-5 w-5 text-white/25" />
                </div>
              </div>
              <p className="text-sm text-white/40 mb-1">No interviews yet</p>
              <p className="text-xs text-white/20 mb-5">Upload a resume and start your first practice loop.</p>
              <Link to="/resume">
                <Button size="sm" variant="outline">Upload resume</Button>
              </Link>
            </Card>
          </motion.div>
        )}

        <div className="flex flex-col gap-2">
          {data?.recent_sessions?.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
            >
              <Link to={s.status === "completed" ? `/report/${s.id}` : `/interview/${s.id}`}>
                <div className="group flex items-center justify-between rounded-xl border border-white/5 bg-base-900/40 px-5 py-4 hover:border-white/10 hover:bg-base-900/60 transition-all duration-200 cursor-pointer">
                  <div className="flex items-center gap-4">
                    {/* Session icon */}
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/4 text-white/25 group-hover:text-accent-400 group-hover:bg-accent-500/10 transition-all duration-200 shrink-0">
                      <Target className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80 group-hover:text-white/90 transition-colors">
                        {s.target_role}
                        <span className="text-white/30 mx-1.5">@</span>
                        <span className="text-white/60">{s.target_company}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/25 flex items-center gap-1 font-mono">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {s.overall_score != null && (
                      <div className="text-right">
                        <span className="font-display text-lg font-bold text-accent-400">
                          {s.overall_score}
                        </span>
                        <span className="text-[10px] text-white/25 font-mono ml-0.5">/100</span>
                      </div>
                    )}
                    <Badge tone={statusTone[s.status] ?? "neutral"}>
                      {statusLabel[s.status] ?? s.status.replace("_", " ")}
                    </Badge>
                    <ChevronRight className="h-3.5 w-3.5 text-white/15 group-hover:text-white/35 group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
