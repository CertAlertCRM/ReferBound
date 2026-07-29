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
        card: "0 1px 2px 0 rgb(15 23 42 / 0.06), 0 2px 8px -1px rgb(15 23 42 / 0.08)",
        lift: "0 6px 16px -2px rgb(15 23 42 / 0.12), 0 3px 8px -2px rgb(15 23 42 / 0.07)",
      },
    },
  },
  plugins: [],
};
export default config;
