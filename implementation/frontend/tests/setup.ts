// Global Vitest setup file for frontend tests.
// - Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
// - Starts/stops MSW server for network mocking
// - Cleans up after each test

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";
import { server } from "./helpers/mocks/server";
import { resetIdCounter } from "./helpers/mocks/data";

// Start MSW server before all tests.
// onUnhandledRequest: "error" ensures no unintended API calls slip through.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

// After each test:
// - Reset MSW handlers to defaults (removes per-test overrides)
// - Clean up rendered components
// - Reset factory ID counter for deterministic IDs
afterEach(() => {
  server.resetHandlers();
  cleanup();
  resetIdCounter();
});

// Shut down MSW server after all tests complete.
afterAll(() => {
  server.close();
});
