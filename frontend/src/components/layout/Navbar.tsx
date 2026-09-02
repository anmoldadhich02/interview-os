import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Brain, LogOut, LayoutDashboard, FileText } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";

export function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { scrollY } = useScroll();

  const navBg = useTransform(scrollY, [0, 60], ["rgba(8,9,12,0)", "rgba(8,9,12,0.92)"]);
  const navBorder = useTransform(scrollY, [0, 60], ["rgba(255,255,255,0)", "rgba(255,255,255,0.06)"]);
  const navBlur = useTransform(scrollY, [0, 60], ["blur(0px)", "blur(20px)"]);

  const isActive = (path: string) => location.pathname === path;
  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
      <motion.header
        style={{
          backgroundColor: navBg,
          borderBottomColor: navBorder,
          borderTopColor: navBorder,
          borderLeftColor: navBorder,
          borderRightColor: navBorder,
          backdropFilter: navBlur,
          WebkitBackdropFilter: navBlur,
        }}
        className="pointer-events-auto flex w-full max-w-4xl items-center justify-between rounded-2xl border border-transparent px-4 py-3 transition-colors duration-300 shadow-float"
      >
        {/* Logo */}
        <Link
          to={user ? "/dashboard" : "/"}
          className="group flex items-center gap-2.5"
        >
          <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-accent-500/10">
            <Brain className="h-4 w-4 text-accent-400 transition-transform duration-300 group-hover:scale-110" />
            {/* Subtle inner glow on hover */}
            <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-accent-500/5" />
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight text-white">
            Interview<span className="text-accent-400">OS</span>
          </span>
        </Link>

        {/* Nav items */}
        {user && !isAuthRoute ? (
          <div className="flex items-center gap-1">
            <NavLink id="nav-dashboard" to="/dashboard" isActive={isActive("/dashboard")} icon={<LayoutDashboard className="h-3.5 w-3.5" />}>
              Dashboard
            </NavLink>
            <NavLink id="nav-resume" to="/resume" isActive={isActive("/resume")} icon={<FileText className="h-3.5 w-3.5" />}>
              Resume
            </NavLink>
            <div className="mx-3 h-4 w-px bg-white/10" />
            <span className="mr-2 text-xs text-white/40 font-medium hidden sm:block">
              {user.full_name.split(" ")[0]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { logout(); navigate("/login"); }}
              className="text-white/50 hover:text-white/80 hover:bg-white/5 gap-1.5 px-2.5"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:block text-xs">Log out</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="px-4 py-1.5 text-sm text-white/60 hover:text-white/90 transition-colors duration-200 font-medium"
            >
              Log in
            </Link>
            <Link to="/register">
              <Button size="sm" className="px-4 text-xs tracking-wide">
                Get started
              </Button>
            </Link>
          </div>
        )}
      </motion.header>
    </div>
  );
}

function NavLink({
  to,
  isActive,
  icon,
  children,
  id,
}: {
  to: string;
  isActive: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Link
      id={id}
      to={to}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium ${
        isActive
          ? "text-white bg-white/6"
          : "text-white/50 hover:text-white/80 hover:bg-white/4"
      }`}
    >
      <span className={isActive ? "text-accent-400" : ""}>{icon}</span>
      {children}
      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute inset-0 rounded-lg border border-white/10 bg-white/4"
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
    </Link>
  );
}
