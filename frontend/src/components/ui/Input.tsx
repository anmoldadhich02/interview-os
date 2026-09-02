import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-white/60 uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "w-full rounded-xl bg-base-800/60 border px-4 py-2.5 text-sm text-white placeholder:text-white/25",
          "transition-all duration-200",
          "focus:outline-none focus:ring-2",
          error
            ? "border-red-500/40 focus:ring-red-500/20 focus:border-red-500/60"
            : "border-white/[0.07] focus:ring-accent-500/20 focus:border-accent-500/40",
          className
        )}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-400/90 flex items-center gap-1">
          <span>⚠</span> {error}
        </span>
      )}
      {hint && !error && (
        <span className="text-xs text-white/30">{hint}</span>
      )}
    </div>
  )
);
Input.displayName = "Input";
