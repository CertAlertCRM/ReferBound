import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand colors read from CSS variables (RGB triplets, defaults in
        // globals.css) so agents can theme their app + partner portals.
        // Palettes live in lib/themes.ts.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          DEFAULT: "rgb(var(--brand-600) / <alpha-value>)",
          dark: "rgb(var(--brand-700) / <alpha-value>)",
          light: "rgb(var(--brand-50) / <alpha-value>)",
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
        // Layered shadows: a tight contact shadow, a mid diffusion, and a wide
        // ambient. One flat shadow reads as a sticker; three read as depth.
        card: "0 1px 2px 0 rgb(15 23 42 / 0.06), 0 2px 6px -1px rgb(15 23 42 / 0.09), 0 8px 20px -6px rgb(15 23 42 / 0.10)",
        lift: "0 1px 2px 0 rgb(15 23 42 / 0.07), 0 6px 14px -3px rgb(15 23 42 / 0.14), 0 18px 36px -10px rgb(15 23 42 / 0.18)",
        btn: "0 1px 2px 0 rgb(15 23 42 / 0.12), 0 2px 6px -1px rgb(15 23 42 / 0.14), inset 0 1px 0 0 rgb(255 255 255 / 0.16)",
        xl: "0 10px 24px -6px rgb(15 23 42 / 0.18), 0 28px 60px -16px rgb(15 23 42 / 0.28)",
      },
    },
  },
  plugins: [],
};
export default config;
