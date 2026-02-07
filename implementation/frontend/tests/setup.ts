// Global Vitest setup file for frontend tests.
// - Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
// - Starts/stops MSW server for network mocking
// - Mocks WebSocket to prevent real connections in test environment
// - Cleans up after each test

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";
import { server } from "./helpers/mocks/server";
import { resetIdCounter } from "./helpers/mocks/data";

// Mock WebSocket to prevent real connections in tests.
// The jsdom/ws WebSocket tries to connect to ws://localhost:3000/ws
// and throws uncaught exceptions when no server is running.
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CLOSED;
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  binaryType = "blob" as BinaryType;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
  }

  send() {}
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return false;
  }
}

// @ts-expect-error replacing global WebSocket with mock
globalThis.WebSocket = MockWebSocket;

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
