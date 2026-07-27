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
          DEFAULT: "#0f172a",
          secondary: "#475569",
          muted: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        lift: "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.05)",
      },
    },
  },
  plugins: [],
};
export default config;
