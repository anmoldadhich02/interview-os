import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "flat" | "highlight";
  hover?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", hover = false, ...props }, ref) => {
    const variantClass = {
      default:
        "bg-base-900/60 border border-white/[0.06] backdrop-blur-sm",
      elevated:
        "bg-gradient-to-br from-base-750/80 to-base-900/90 border border-white/[0.07] shadow-card",
      flat:
        "bg-base-800/40 border border-white/[0.05]",
      highlight:
        "bg-gradient-to-br from-accent-500/5 to-transparent border border-accent-500/15",
    }[variant];

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl p-6",
          variantClass,
          hover && "transition-all duration-300 hover:border-white/12 hover:shadow-card-hover hover:-translate-y-px cursor-pointer",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
