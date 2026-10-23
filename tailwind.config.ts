import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Strict black/white base. Grays are white-over-black tones only —
        // no other neutral hue.
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        "text-primary": "rgb(var(--c-text) / <alpha-value>)",
        "text-secondary": "rgb(var(--c-muted) / <alpha-value>)",

        // The only permitted colours: royal red / blue / green + neon shades.
        // Semantics: blue = primary/interactive, green = safe (>= threshold),
        // red = danger (< threshold).
        accent: "#2E5BFF", // royal blue (primary)
        "accent-neon": "rgb(var(--c-blue-neon) / <alpha-value>)",
        blue: "#2E5BFF",
        "blue-neon": "rgb(var(--c-blue-neon) / <alpha-value>)",
        red: "#E11030", // royal red
        "red-neon": "rgb(var(--c-red-neon) / <alpha-value>)",
        green: "rgb(var(--c-green) / <alpha-value>)", // light royal green
        "green-neon": "rgb(var(--c-green-neon) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-blue": "0 0 0 1px #2E5BFF, 0 0 16px -2px rgba(46,91,255,0.55)",
        "glow-green": "0 0 0 1px #17C964, 0 0 16px -2px rgba(23,201,100,0.55)",
        "glow-red": "0 0 0 1px #E11030, 0 0 16px -2px rgba(225,16,48,0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
