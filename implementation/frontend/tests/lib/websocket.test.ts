// Tests for lib/websocket.ts: ChatDFSocket class
// Tests: FE-W-1 (connection), FE-W-2 (reconnect with backoff), FE-W-3 (message parsing)
//
// References:
//   spec/frontend/plan.md#websocket-integration
//   spec/frontend/test_plan.md#websocket-tests

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
  });

  describe("FE-W-1: Connection with valid token", () => {
    it("opens WebSocket connection with token as query param", () => {
      const socket = new ChatDFSocket();
      socket.connect("my-test-token");

      expect(instances).toHaveLength(1);
      expect(instances[0].url).toContain("/ws?token=my-test-token");

      socket.disconnect();
    });

    it("fires onOpen callback when connection opens", () => {
      const socket = new ChatDFSocket();
      const onOpen = vi.fn();
      socket.onOpen(onOpen);
      socket.connect("token-123");

      // Simulate the connection opening
      instances[0].simulateOpen();

      expect(onOpen).toHaveBeenCalledTimes(1);

      socket.disconnect();
    });

    it("fires onClose callback when connection closes", () => {
      const socket = new ChatDFSocket();
      const onClose = vi.fn();
      socket.onClose(onClose);
      socket.connect("token-123");

      instances[0].simulateOpen();
      // disconnect() will close without attempting reconnect
      socket.disconnect();

      expect(onClose).toHaveBeenCalled();
    });

    it("fires onError callback on WebSocket error", () => {
      const socket = new ChatDFSocket();
      const onError = vi.fn();
      socket.onError(onError);
      socket.connect("token-123");

      instances[0].simulateError(new Error("Connection failed"));

      expect(onError).toHaveBeenCalledTimes(1);

      socket.disconnect();
    });
  });

  describe("FE-W-2: Reconnect on disconnect with exponential backoff", () => {
    it("reconnects after unexpected close with 1s initial delay", () => {
      const socket = new ChatDFSocket();
      socket.connect("token-abc");

      // Open then simulate unexpected close
      instances[0].simulateOpen();
      instances[0].simulateClose();

      // Should not have reconnected yet
      expect(instances).toHaveLength(1);

      // Advance timer by 1 second (initial backoff)
      vi.advanceTimersByTime(1000);

      // A new WebSocket instance should have been created
      expect(instances).toHaveLength(2);
      expect(instances[1].url).toContain("/ws?token=token-abc");

      socket.disconnect();
    });

    it("doubles the backoff delay on successive disconnects: 1s, 2s, 4s", () => {
      const socket = new ChatDFSocket();
      socket.connect("token-abc");

      // First connection opens then drops
      instances[0].simulateOpen();
      instances[0].simulateClose();

      // First reconnect after 1s
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2);

      // Second connection drops
      instances[1].simulateOpen();
      instances[1].simulateClose();

      // Should NOT reconnect after just 1s
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2);

      // Should reconnect after 2s total
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(3);

      // Third connection drops
      instances[2].simulateOpen();
      instances[2].simulateClose();

      // Should NOT reconnect after 2s
      vi.advanceTimersByTime(2000);
      expect(instances).toHaveLength(3);

      // Should reconnect after 4s total
      vi.advanceTimersByTime(2000);
      expect(instances).toHaveLength(4);

      socket.disconnect();
    });

    it("caps backoff delay at 30 seconds", () => {
      const socket = new ChatDFSocket();
      socket.connect("token-abc");

      // Simulate many drops to push backoff past 30s
      // 1, 2, 4, 8, 16, 32 -> capped at 30
      for (let i = 0; i < 5; i++) {
        instances[i].simulateOpen();
        instances[i].simulateClose();
        vi.advanceTimersByTime(Math.min(1000 * Math.pow(2, i), 30000));
      }
      expect(instances).toHaveLength(6);

      // At this point backoff would be 32s but should be capped at 30s
      instances[5].simulateOpen();
      instances[5].simulateClose();

      // After 29 seconds, should not have reconnected
      vi.advanceTimersByTime(29000);
      expect(instances).toHaveLength(6);

      // After 30 seconds total, should reconnect
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(7);

      socket.disconnect();
    });

    it("does not reconnect after explicit disconnect()", () => {
      const socket = new ChatDFSocket();
      socket.connect("token-abc");

      instances[0].simulateOpen();
      socket.disconnect();

      // Wait well past any backoff period
      vi.advanceTimersByTime(60000);

      // Should only have the original instance, no reconnect
      expect(instances).toHaveLength(1);
    });

    it("resets backoff when connect() is called again", () => {
      const socket = new ChatDFSocket();
      socket.connect("token-abc");

      // First connect and drop -> backoff 1s
      instances[0].simulateOpen();
      instances[0].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2);

      // Second connect and drop -> backoff 2s
      instances[1].simulateOpen();
      instances[1].simulateClose();
      vi.advanceTimersByTime(2000);
      expect(instances).toHaveLength(3);

      // Disconnect and start a fresh connect() call -- this resets backoff
      socket.disconnect();
      socket.connect("token-abc");

      // New connect creates a fresh instance
      expect(instances).toHaveLength(4);

      // Drop it -- backoff should be back to 1s (not 4s)
      instances[3].simulateOpen();
      instances[3].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(5);

      socket.disconnect();
    });
  });

  describe("FE-W-3: Message parsing and event dispatch", () => {
    it("parses JSON messages and dispatches to onMessage callback", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      socket.onMessage(onMsg);
      socket.connect("token-123");

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

    it("dispatches multiple messages to callback", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      socket.onMessage(onMsg);
      socket.connect("token-123");

      instances[0].simulateOpen();
      instances[0].simulateMessage({ type: "chat_token", token: "Hi" });
      instances[0].simulateMessage({ type: "chat_complete", message_id: "m1" });

      expect(onMsg).toHaveBeenCalledTimes(2);
      expect(onMsg).toHaveBeenNthCalledWith(1, {
        type: "chat_token",
        token: "Hi",
      });
      expect(onMsg).toHaveBeenNthCalledWith(2, {
        type: "chat_complete",
        message_id: "m1",
      });

      socket.disconnect();
    });

    it("supports multiple onMessage callbacks", () => {
      const socket = new ChatDFSocket();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      socket.onMessage(cb1);
      socket.onMessage(cb2);
      socket.connect("token-123");

      instances[0].simulateOpen();
      instances[0].simulateMessage({ type: "dataset_loaded", dataset_id: "ds-1" });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);

      socket.disconnect();
    });

    it("handles unknown message types without throwing", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      socket.onMessage(onMsg);
      socket.connect("token-123");

      instances[0].simulateOpen();

      // Unknown type should still be dispatched, no error
      expect(() => {
        instances[0].simulateMessage({
          type: "totally_unknown_event",
          payload: 42,
        });
      }).not.toThrow();

      expect(onMsg).toHaveBeenCalledWith({
        type: "totally_unknown_event",
        payload: 42,
      });

      socket.disconnect();
    });

    it("handles malformed (non-JSON) messages gracefully", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      const onErr = vi.fn();
      socket.onMessage(onMsg);
      socket.onError(onErr);
      socket.connect("token-123");

      instances[0].simulateOpen();

      // Send a non-JSON string -- should not throw
      expect(() => {
        instances[0].simulateMessage("this is not json");
      }).not.toThrow();

      // onMessage should not be called for malformed messages
      expect(onMsg).not.toHaveBeenCalled();

      socket.disconnect();
    });

    it("continues dispatching messages after reconnect", () => {
      const socket = new ChatDFSocket();
      const onMsg = vi.fn();
      socket.onMessage(onMsg);
      socket.connect("token-123");

      instances[0].simulateOpen();
      instances[0].simulateMessage({ type: "chat_token", token: "A" });
      expect(onMsg).toHaveBeenCalledTimes(1);

      // Disconnect and reconnect
      instances[0].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(instances).toHaveLength(2);

      instances[1].simulateOpen();
      instances[1].simulateMessage({ type: "chat_token", token: "B" });

      expect(onMsg).toHaveBeenCalledTimes(2);
      expect(onMsg).toHaveBeenNthCalledWith(2, {
        type: "chat_token",
        token: "B",
      });

      socket.disconnect();
    });
  });
});
