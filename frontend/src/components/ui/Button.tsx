import React, { ButtonHTMLAttributes, forwardRef, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-accent-500 text-white font-semibold hover:bg-accent-400 border border-accent-400/50 hover:border-accent-300 shadow-[0_0_20px_rgba(34,211,238,0.15)] hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] active:scale-[0.97]",
  secondary:
    "bg-base-900/50 text-[#C8D0E0] font-medium border border-white/10 hover:border-white/20 hover:text-white hover:bg-base-800 active:scale-[0.98]",
  outline:
    "bg-transparent text-accent-400 font-medium border border-accent-500/30 hover:border-accent-500/60 hover:bg-accent-500/5 active:scale-[0.98]",
  ghost:
    "bg-transparent text-white/50 hover:text-white/90 hover:bg-white/5 font-medium",
  danger:
    "bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 active:scale-[0.98]",
};

const sizeStyles: Record<string, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2 rounded-lg gap-2",
  lg: "text-sm px-5 py-2.5 rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    // For magnetic/glare effect on hover
    const btnRef = useRef<HTMLButtonElement>(null);
    const x = useMotionValue(0.5);
    const y = useMotionValue(0.5);

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = btnRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      x.set((e.clientX - rect.left) / rect.width);
      y.set((e.clientY - rect.top) / rect.height);
    };

    const background = useTransform(
      [x, y],
      ([vx, vy]: number[]) =>
        `radial-gradient(circle at ${vx * 100}% ${vy * 100}%, rgba(255,255,255,0.12) 0%, transparent 60%)`
    );

    return (
      <button
        ref={(node) => {
          // merge refs
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
          // @ts-ignore
          btnRef.current = node;
        }}
        disabled={disabled || loading}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          x.set(0.5);
          y.set(0.5);
        }}
        className={cn(
          "relative overflow-hidden inline-flex items-center justify-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {/* Dynamic glare layer */}
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100 mix-blend-overlay"
          style={{ background }}
        />
        
        {/* Content */}
        <span className="relative z-10 flex items-center gap-inherit">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />}
          {children}
        </span>
      </button>
    );
  }
);
Button.displayName = "Button";
