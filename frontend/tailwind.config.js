/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#080A0F",
          900: "#0D1016",
          850: "#11151C",
          800: "#171C28",
          750: "#1A1F2E",
          700: "#1F2535",
          600: "#2A3245",
          500: "#3D4B66",
          400: "#5A6B8A",
        },
        accent: {
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#06B6D4",
          600: "#0891B2",
          700: "#0E7490",
        },
        cyan: {
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#06B6D4",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(0,0,0,0.3)",
        "glow-sm": "0 0 10px rgba(0,0,0,0.2)",
        card: "0 4px 24px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.04) inset",
        "card-hover": "0 8px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset",
        float: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-slow": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg) translateX(80px) rotate(0deg)" },
          "100%": { transform: "rotate(360deg) translateX(80px) rotate(-360deg)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease forwards",
        "fade-in-slow": "fade-in-slow 1s ease forwards",
        "slide-up": "slide-up 0.6s ease forwards",
        "scale-in": "scale-in 0.4s ease forwards",
        orbit: "orbit 12s linear infinite",
        "orbit-slow": "orbit 20s linear infinite",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        marquee: "marquee 20s linear infinite",
      },
    },
  },
  plugins: [],
};
