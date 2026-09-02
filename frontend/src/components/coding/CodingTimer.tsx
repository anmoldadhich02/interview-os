import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

interface CodingTimerProps {
  totalMinutes: number;
  onExpired: () => void;
  paused?: boolean;
}

export function CodingTimer({ totalMinutes, onExpired, paused = false }: CodingTimerProps) {
  const totalSeconds = totalMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (!expiredRef.current) {
            expiredRef.current = true;
            setTimeout(onExpired, 0); // fire outside of setState
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paused, onExpired]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = secondsLeft / totalSeconds; // 1 → 0

  // SVG ring
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * progress;

  // Color: green → amber → red
  const color =
    progress > 0.5
      ? "#34d399"   // emerald-400
      : progress > 0.25
      ? "#fbbf24"   // amber-400
      : "#f87171";  // red-400

  return (
    <div className="flex items-center gap-2" title={`${minutes}m ${seconds}s remaining`}>
      {/* SVG circular progress ring */}
      <div className="relative h-10 w-10">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 44 44">
          {/* Track */}
          <circle
            cx="22" cy="22" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="3"
          />
          {/* Progress */}
          <circle
            cx="22" cy="22" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: "stroke-dasharray 0.8s linear, stroke 0.5s" }}
          />
        </svg>
        <Clock
          className="absolute inset-0 m-auto h-4 w-4"
          style={{ color }}
        />
      </div>

      {/* Time display */}
      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color }}
      >
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
