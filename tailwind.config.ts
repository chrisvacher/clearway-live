import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// CORE's Tailwind approach, with values supplied only by the Live design system.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    colors: {
      surface: "var(--cwl-surface)",
      card: "var(--cwl-surface-card)",
      foreground: "var(--cwl-text)",
      muted: "var(--cwl-text-muted)",
      primary: "var(--cwl-button-primary)",
      "on-primary": "var(--cwl-on-accent)",
    },
    fontFamily: { sans: ["var(--cwl-font)"] },
    spacing: {
      0: "0", 1: "var(--space-1)", 2: "var(--space-2)",
      3: "var(--space-3)", 4: "var(--space-4)", 6: "var(--space-6)",
      8: "var(--space-8)", 12: "var(--space-12)", 16: "var(--space-16)",
    },
    borderRadius: { button: "var(--cwl-radius-button)", card: "var(--cwl-radius-card)" },
  },
  plugins: [animate],
} satisfies Config;
