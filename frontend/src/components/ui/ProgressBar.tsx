export function ProgressBar({
  value,
  max = 100,
  color = "accent",
  showLabel = false,
}: {
  value: number;
  max?: number;
  color?: "accent" | "emerald" | "amber" | "red";
  showLabel?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const barColor = {
    accent: "from-accent-600 to-accent-400",
    emerald: "from-emerald-600 to-emerald-400",
    amber: "from-amber-600 to-amber-400",
    red: "from-red-600 to-red-400",
  }[color];

  const glowColor = {
    accent: "rgba(99,102,241,0.4)",
    emerald: "rgba(52,211,153,0.4)",
    amber: "rgba(251,191,36,0.4)",
    red: "rgba(248,113,113,0.4)",
  }[color];

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
          style={{
            width: `${pct}%`,
            boxShadow: `0 0 8px ${glowColor}`,
          }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] font-mono text-white/35 w-8 text-right shrink-0">
          {Math.round(pct)}
        </span>
      )}
    </div>
  );
}
