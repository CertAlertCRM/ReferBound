import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#608afa",
          500: "#3b63f6",
          600: "#2547eb",
          700: "#1d36d8",
          800: "#1e2faf",
          900: "#1e2c8a",
          DEFAULT: "#2547eb",
          dark: "#1d36d8",
          light: "#eef4ff",
        },
        ink: {
          // Contrast-safe greys: secondary reads as body text (slate-700),
          // muted stays quiet but passes WCAG AA on white (slate-500).
          DEFAULT: "#0f172a",
          secondary: "#334155",
          muted: "#64748b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(15 23 42 / 0.10), 0 4px 14px -2px rgb(15 23 42 / 0.12)",
        lift: "0 8px 22px -3px rgb(15 23 42 / 0.18), 0 4px 10px -2px rgb(15 23 42 / 0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
