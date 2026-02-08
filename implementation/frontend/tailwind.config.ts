import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        text: "var(--color-text)",
        "text-secondary": "var(--color-text-secondary)",
        border: "var(--color-border)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        error: "var(--color-error)",
        warning: "var(--color-warning)",
      },
      boxShadow: {
        panel: "0 1px 3px var(--color-shadow)",
      },
      keyframes: {
        "panel-content-fade-in": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "panel-content-fade-in": "panel-content-fade-in 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
