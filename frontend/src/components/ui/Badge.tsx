import { cn } from "@/lib/cn";

const toneStyles: Record<string, string> = {
  neutral:
    "bg-white/5 text-white/60 border-white/10",
  accent:
    "bg-accent-500/10 text-accent-400 border-accent-500/20",
  success:
    "bg-emerald-500/8 text-emerald-400 border-emerald-500/15",
  warning:
    "bg-amber-500/8 text-amber-400 border-amber-500/15",
  danger:
    "bg-red-500/8 text-red-400 border-red-500/15",
  cyan:
    "bg-cyan-400/8 text-cyan-400 border-cyan-400/15",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof toneStyles;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide capitalize",
        toneStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
