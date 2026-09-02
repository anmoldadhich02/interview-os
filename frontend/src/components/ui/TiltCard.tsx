import React, { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/cn";

interface TiltCardProps extends React.ComponentPropsWithoutRef<typeof motion.div> {
  children: React.ReactNode;
  maxTilt?: number;
  scaleOnHover?: number;
}

export function TiltCard({
  children,
  className,
  maxTilt = 15,
  scaleOnHover = 1.02,
  ...props
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 40 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 40 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-maxTilt, maxTilt]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      whileHover={{ scale: scaleOnHover }}
      className={cn(
        "relative transition-all duration-200 ease-out",
        className
      )}
      {...props}
    >
      {/* Glare effect */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-50 rounded-inherit opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useTransform(
            [mouseXSpring, mouseYSpring],
            ([vx, vy]: number[]) => {
              const rx = (vx + 0.5) * 100;
              const ry = (vy + 0.5) * 100;
              return `radial-gradient(circle at ${rx}% ${ry}%, rgba(255,255,255,0.1) 0%, transparent 50%)`;
            }
          ),
        }}
      />
      
      {/* Content */}
      <div style={{ transform: "translateZ(30px)" }} className="h-full w-full">
        {children}
      </div>
    </motion.div>
  );
}
