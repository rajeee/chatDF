// Global Vitest setup file for frontend tests.
// - Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
// - Starts/stops MSW server for network mocking
// - Mocks WebSocket to prevent real connections in test environment
// - Patches Request constructor for Bun/jsdom AbortSignal compatibility
// - Cleans up after each test

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";
import { server } from "./helpers/mocks/server";
import { resetIdCounter } from "./helpers/mocks/data";

// Patch Request to work around Bun + jsdom AbortSignal incompatibility.
// Under Bun, the native AbortController produces an AbortSignal that jsdom's
// Request constructor rejects with "signal is not of type AbortSignal".
// This happens because jsdom's Request (from undici) performs a strict type
// check that fails across Bun/jsdom realms. MSW's fetch interceptor constructs
// new Request objects with the original signal, triggering this error.
// Fix: wrap Request to strip the signal from init, then re-attach it to the
// instance so code that reads request.signal still gets a value.
const OriginalRequest = globalThis.Request;
class PatchedRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal, ...rest } = init;
      super(input, rest);
      // Expose the original signal on the instance for code that reads it
      Object.defineProperty(this, "signal", {
        get: () => signal,
        configurable: true,
      });
    } else {
      super(input, init);
    }
  }
}
// Preserve prototype chain so instanceof checks work
Object.defineProperty(PatchedRequest, "name", { value: "Request" });
globalThis.Request = PatchedRequest as typeof Request;

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
