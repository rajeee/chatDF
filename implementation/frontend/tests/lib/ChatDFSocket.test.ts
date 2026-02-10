// Tests for ChatDFSocket class (lib/websocket.ts)
// Covers: connection, disconnect, callbacks, message parsing,
//         reconnect with exponential backoff, URL building
//
// Uses MockWebSocket infrastructure with fake timers for backoff tests.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MockWebSocket,
  installMockWebSocket,
} from "../helpers/mocks/websocket";
import { ChatDFSocket } from "@/lib/websocket";

describe("ChatDFSocket", () => {
  let instances: MockWebSocket[];
  let cleanupWs: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    const result = installMockWebSocket();
    instances = result.instances;
    cleanupWs = result.cleanup;
  });

  afterEach(() => {
    cleanupWs();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("connect", () => {
    it("creates a WebSocket connection", () => {
      const socket = new ChatDFSocket();
      socket.connect();

      expect(instances).toHaveLength(1);
      expect(instances[0].url).toContain("/ws");

      socket.disconnect();
    });

    it("appends ?token= to URL when token is provided", () => {
      const socket = new ChatDFSocket();
      socket.connect("my-session-token");

      expect(instances).toHaveLength(1);
      expect(instances[0].url).toContain("?token=my-session-token");

      socket.disconnect();
    });

    it("does not append ?token= when no token is provided", () => {
      const socket = new ChatDFSocket();
      socket.connect();

      expect(instances[0].url).not.toContain("?token=");

      socket.disconnect();
    });

    it("resets backoff timer on fresh connect", () => {
      const socket = new ChatDFSocket();
      socket.connect("tok");

      // Build up backoff by simulating drops
      instances[0].simulateOpen();
      instances[0].simulateClose();
      vi.advanceTimersByTime(1000); // backoff 1s -> reconnect
      expect(instances).toHaveLength(2);

      instances[1].simulateOpen();
      instances[1].simulateClose();
      vi.advanceTimersByTime(2000); // backoff 2s -> reconnect
      expect(instances).toHaveLength(3);

      // Now do a fresh connect() which should reset backoff to 1s
      socket.disconnect();
      socket.connect("tok");
      expect(instances).toHaveLength(4);

      // Drop it -- backoff should be 1s (reset), not 4s
      instances[3].simulateOpen();
      instances[3].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(5);

      socket.disconnect();
    });
  });

  describe("disconnect", () => {
    it("closes the WebSocket and stops reconnect", () => {
      const socket = new ChatDFSocket();
      socket.connect("tok");

      instances[0].simulateOpen();
      socket.disconnect();

      // WebSocket should be closed
      expect(instances[0].readyState).toBe(MockWebSocket.CLOSED);

      // Wait past any potential backoff -- no reconnect should happen
      vi.advanceTimersByTime(60000);
      expect(instances).toHaveLength(1);
    });
  });

  describe("onMessage callback", () => {
    it("receives parsed JSON messages", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      socket.onMessage(onMsg);
      socket.connect("tok");

      instances[0].simulateOpen();
      instances[0].simulateMessage({
        type: "chat_token",
        token: "Hello",
        message_id: "msg-1",
      });

      expect(onMsg).toHaveBeenCalledTimes(1);
      expect(onMsg).toHaveBeenCalledWith({
        type: "chat_token",
        token: "Hello",
        message_id: "msg-1",
      });

      socket.disconnect();
    });

    it("silently ignores non-JSON messages without calling callback or throwing", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      const onErr = vi.fn();
      socket.onMessage(onMsg);
      socket.onError(onErr);
      socket.connect("tok");

      instances[0].simulateOpen();

      expect(() => {
        instances[0].simulateMessage("not valid json {{{");
      }).not.toThrow();

      // onMessage should NOT be called for unparseable messages
      expect(onMsg).not.toHaveBeenCalled();

      socket.disconnect();
    });
  });

  describe("onOpen callback", () => {
    it("fires on connection open", () => {
      const socket = new ChatDFSocket();
      const onOpen = vi.fn();
      socket.onOpen(onOpen);
      socket.connect("tok");

      expect(onOpen).not.toHaveBeenCalled();

      instances[0].simulateOpen();

      expect(onOpen).toHaveBeenCalledTimes(1);

      socket.disconnect();
    });
  });

  describe("onClose callback", () => {
    it("fires on connection close", () => {
      const socket = new ChatDFSocket();
      const onClose = vi.fn();
      socket.onClose(onClose);
      socket.connect("tok");

      instances[0].simulateOpen();
      instances[0].simulateClose();

      expect(onClose).toHaveBeenCalledTimes(1);

      socket.disconnect();
    });
  });

  describe("onError callback", () => {
    it("fires on WebSocket error", () => {
      const socket = new ChatDFSocket();
      const onError = vi.fn();
      socket.onError(onError);
      socket.connect("tok");

      const error = new Error("Connection refused");
      instances[0].simulateError(error);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);

      socket.disconnect();
    });
  });

  describe("automatic reconnect", () => {
    it("reconnects on unexpected close after 1s initial delay", () => {
      const socket = new ChatDFSocket();
      socket.connect("tok");

      instances[0].simulateOpen();
      instances[0].simulateClose();

      // Not yet reconnected
      expect(instances).toHaveLength(1);

      vi.advanceTimersByTime(1000);

      // Should have created a new connection
      expect(instances).toHaveLength(2);
      expect(instances[1].url).toContain("?token=tok");

      socket.disconnect();
    });

    it("uses exponential backoff: 1s, 2s, 4s", () => {
      const socket = new ChatDFSocket();
      socket.connect("tok");

      // First drop -> 1s backoff
      instances[0].simulateOpen();
      instances[0].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2);

      // Second drop -> 2s backoff
      instances[1].simulateOpen();
      instances[1].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2); // not yet
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(3);

      // Third drop -> 4s backoff
      instances[2].simulateOpen();
      instances[2].simulateClose();
      vi.advanceTimersByTime(3000);
      expect(instances).toHaveLength(3); // not yet
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(4);

      socket.disconnect();
    });

    it("caps backoff at 30 seconds", () => {
      const socket = new ChatDFSocket();
      socket.connect("tok");

      // Simulate drops to push backoff past 30s:
      // 1s, 2s, 4s, 8s, 16s, then next would be 32s but capped at 30s
      for (let i = 0; i < 5; i++) {
        instances[i].simulateOpen();
        instances[i].simulateClose();
        vi.advanceTimersByTime(Math.min(1000 * Math.pow(2, i), 30000));
      }
      expect(instances).toHaveLength(6);

      // At this point internal backoff would be 32s, but should be capped at 30s
      instances[5].simulateOpen();
      instances[5].simulateClose();

      vi.advanceTimersByTime(29000);
      expect(instances).toHaveLength(6); // not yet at 29s

      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(7); // reconnected at 30s

      socket.disconnect();
    });

    it("does not reconnect after intentional disconnect", () => {
      const socket = new ChatDFSocket();
      socket.connect("tok");

      instances[0].simulateOpen();
      socket.disconnect(); // intentional

      vi.advanceTimersByTime(60000);

      expect(instances).toHaveLength(1);
    });
  });

  describe("multiple callbacks", () => {
    it("supports multiple callbacks registered for each event type", () => {
      const socket = new ChatDFSocket();

      const onMsg1 = vi.fn();
      const onMsg2 = vi.fn();
      const onOpen1 = vi.fn();
      const onOpen2 = vi.fn();
      const onClose1 = vi.fn();
      const onClose2 = vi.fn();
      const onError1 = vi.fn();
      const onError2 = vi.fn();

      socket.onMessage(onMsg1);
      socket.onMessage(onMsg2);
      socket.onOpen(onOpen1);
      socket.onOpen(onOpen2);
      socket.onClose(onClose1);
      socket.onClose(onClose2);
      socket.onError(onError1);
      socket.onError(onError2);

      socket.connect("tok");

      // Open
      instances[0].simulateOpen();
      expect(onOpen1).toHaveBeenCalledTimes(1);
      expect(onOpen2).toHaveBeenCalledTimes(1);

      // Message
      instances[0].simulateMessage({ type: "ping" });
      expect(onMsg1).toHaveBeenCalledTimes(1);
      expect(onMsg2).toHaveBeenCalledTimes(1);

      // Error
      instances[0].simulateError(new Error("oops"));
      expect(onError1).toHaveBeenCalledTimes(1);
      expect(onError2).toHaveBeenCalledTimes(1);

      // Close (via disconnect)
      socket.disconnect();
      expect(onClose1).toHaveBeenCalledTimes(1);
      expect(onClose2).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL building", () => {
    it("uses VITE_WS_URL when set", () => {
      vi.stubEnv("VITE_WS_URL", "ws://backend:8000/ws");

      const socket = new ChatDFSocket();
      socket.connect();

      expect(instances[0].url).toBe("ws://backend:8000/ws");

      socket.disconnect();
    });

    it("appends token to VITE_WS_URL when set", () => {
      vi.stubEnv("VITE_WS_URL", "ws://backend:8000/ws");

      const socket = new ChatDFSocket();
      socket.connect("abc123");

      expect(instances[0].url).toBe("ws://backend:8000/ws?token=abc123");

      socket.disconnect();
    });

    it("uses ws: protocol for http: location when VITE_WS_URL is not set", () => {
      vi.stubEnv("VITE_WS_URL", "");

      // jsdom defaults location.protocol to "http:" and location.host to "localhost"
      const socket = new ChatDFSocket();
      socket.connect();

      expect(instances[0].url).toMatch(/^ws:\/\//);
      expect(instances[0].url).toContain("/ws");

      socket.disconnect();
    });

    it("uses wss: protocol for https: location when VITE_WS_URL is not set", () => {
      vi.stubEnv("VITE_WS_URL", "");

      // jsdom's location properties are non-configurable, so we replace
      // the entire location object to simulate https:
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        value: { ...originalLocation, protocol: "https:", host: "example.com" },
        writable: true,
        configurable: true,
      });

      const socket = new ChatDFSocket();
      socket.connect();

      expect(instances[0].url).toMatch(/^wss:\/\//);
      expect(instances[0].url).toContain("/ws");

      socket.disconnect();

      // Restore original location
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });
  });
});
