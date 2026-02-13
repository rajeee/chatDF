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
      "tests/components/**/*.test.{ts,tsx}",
      "tests/hooks/useWebSocket.test.tsx",
      "tests/hooks/useConversation.test.tsx",
      "tests/hooks/useKeyboardShortcuts.test.tsx",
      "tests/hooks/useKeyboardShortcuts.datasetPanel.test.tsx",
      "tests/hooks/useAuth.test.tsx",
      "tests/hooks/useFocusTrap.test.tsx",
      "tests/routing/**/*.test.{ts,tsx}",
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "tests/smoke.test.ts",
    ],
    exclude: ["tests/e2e/**"],
  },
});
