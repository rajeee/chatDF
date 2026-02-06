import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        text: "var(--color-text)",
        accent: "var(--color-accent)",
        error: "var(--color-error)",
        warning: "var(--color-warning)",
      },
    },
  },
  plugins: [],
} satisfies Config;
