/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.resolve(frontendDir, "tests");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(frontendDir, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(testsDir, "setup.ts")],
    css: true,
    include: [
      "tests/stores/**/*.test.{ts,tsx}",
      "tests/utils/**/*.test.{ts,tsx}",
      "tests/api/**/*.test.{ts,tsx}",
      "tests/lib/**/*.test.{ts,tsx}",
      "tests/hooks/useSwipeToDismiss.test.ts",
      "tests/hooks/useDraggable.test.ts",
      "tests/hooks/useResizable.test.ts",
      "tests/hooks/useSortedRows.test.ts",
      "tests/hooks/useSqlAutocomplete.test.ts",
      "tests/hooks/useEditableCodeMirror.test.ts",
      "tests/hooks/useTheme.test.ts",
      "tests/hooks/test_theme.test.ts",
    ],
    exclude: ["tests/e2e/**"],
  },
});
