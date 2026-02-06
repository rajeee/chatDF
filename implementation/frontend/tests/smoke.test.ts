// Smoke test to verify the test infrastructure is working.
// This file can be removed once real tests are in place.

import { describe, it, expect } from "vitest";
import {
  createUser,
  createConversation,
  createMessage,
  createDataset,
  createUsageStats,
  createConversationList,
} from "./helpers/mocks/data";
import { server } from "./helpers/mocks/server";
import { http, HttpResponse } from "msw";
import { MockWebSocket, installMockWebSocket } from "./helpers/mocks/websocket";

describe("Test infrastructure smoke test", () => {
  describe("Factory functions", () => {
    it("createUser returns valid shape", () => {
      const user = createUser();
      expect(user.user_id).toBe("user-1");
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("Test User");
      expect(user.avatar_url).toBeNull();
    });

    it("createUser accepts overrides", () => {
      const user = createUser({
        name: "Custom Name",
        email: "custom@test.com",
      });
      expect(user.name).toBe("Custom Name");
      expect(user.email).toBe("custom@test.com");
      expect(user.user_id).toBe("user-1"); // default preserved
    });

    it("createConversation returns valid shape", () => {
      const conv = createConversation();
      expect(conv.id).toMatch(/^conv-/);
      expect(conv.title).toBe("Test Conversation");
      expect(conv.dataset_count).toBe(0);
      expect(conv.created_at).toBeTruthy();
      expect(conv.updated_at).toBeTruthy();
    });

    it("createConversationList returns correct count", () => {
      const list = createConversationList(5);
      expect(list).toHaveLength(5);
      list.forEach((conv, i) => {
        expect(conv.title).toBe(`Conversation ${i + 1}`);
      });
    });

    it("createMessage returns valid shape", () => {
      const msg = createMessage();
      expect(msg.id).toMatch(/^msg-/);
      expect(msg.conversation_id).toBe("conv-1");
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello, world!");
      expect(msg.sql_query).toBeNull();
      expect(msg.sql_result).toBeNull();
      expect(msg.error).toBeNull();
    });

    it("createDataset returns valid shape", () => {
      const ds = createDataset();
      expect(ds.id).toMatch(/^ds-/);
      expect(ds.name).toBe("test_dataset");
      expect(ds.status).toBe("ready");
      expect(ds.row_count).toBe(100);
      expect(ds.column_count).toBe(3);
      expect(ds.columns).toHaveLength(3);
      expect(ds.error).toBeNull();
    });

    it("createUsageStats returns valid shape", () => {
      const usage = createUsageStats();
      expect(usage.tokens_used).toBe(1500);
      expect(usage.token_limit).toBe(100000);
      expect(usage.warning_threshold_pct).toBe(80);
      expect(usage.window_reset_at).toBeTruthy();
    });

    it("ID counter resets between tests (isolation check)", () => {
      // After resetIdCounter() in afterEach, IDs should start fresh
      const conv = createConversation();
      expect(conv.id).toBe("conv-1");
      const msg = createMessage();
      expect(msg.id).toBe("msg-2");
    });
  });

  describe("MSW handlers", () => {
    it("GET /auth/me returns test user", async () => {
      const res = await fetch("/auth/me");
      const data = await res.json();
      expect(data.user_id).toBe("user-1");
      expect(data.email).toBe("test@example.com");
    });

    it("GET /conversations returns empty list by default", async () => {
      const res = await fetch("/conversations");
      const data = await res.json();
      expect(data.conversations).toEqual([]);
    });

    it("POST /conversations returns new conversation with 201", async () => {
      const res = await fetch("/conversations", { method: "POST" });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeTruthy();
      expect(data.title).toBe("Test Conversation");
    });

    it("GET /usage returns usage stats", async () => {
      const res = await fetch("/usage");
      const data = await res.json();
      expect(data.tokens_used).toBe(1500);
      expect(data.token_limit).toBe(100000);
    });

    it("POST /auth/logout returns success", async () => {
      const res = await fetch("/auth/logout", { method: "POST" });
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("allows per-test handler overrides", async () => {
      // Override the default handler for this test only
      server.use(
        http.get("/auth/me", () => {
          return HttpResponse.json(null, { status: 401 });
        })
      );

      const res = await fetch("/auth/me");
      expect(res.status).toBe(401);
    });

    it("handler overrides are reset between tests", async () => {
      // Previous test's override should be gone
      const res = await fetch("/auth/me");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user_id).toBe("user-1");
    });
  });

  describe("WebSocket mock", () => {
    it("MockWebSocket records sent messages", () => {
      const ws = new MockWebSocket("ws://localhost/ws");
      ws.simulateOpen();
      ws.send(JSON.stringify({ type: "ping" }));
      expect(ws.sentMessages).toHaveLength(1);
      expect(ws.getSentJSON()).toEqual([{ type: "ping" }]);
    });

    it("MockWebSocket simulates incoming messages", () => {
      const ws = new MockWebSocket("ws://localhost/ws");
      const received: string[] = [];
      ws.onmessage = (event) => {
        received.push(event.data);
      };
      ws.simulateOpen();
      ws.simulateMessage({ type: "chat_token", token: "Hello" });
      expect(received).toHaveLength(1);
      expect(JSON.parse(received[0])).toEqual({
        type: "chat_token",
        token: "Hello",
      });
    });

    it("MockWebSocket throws when sending on closed connection", () => {
      const ws = new MockWebSocket("ws://localhost/ws");
      expect(() => ws.send("test")).toThrow("WebSocket is not open");
    });

    it("installMockWebSocket replaces global WebSocket", () => {
      const { instances, cleanup } = installMockWebSocket();
      try {
        const ws = new WebSocket("ws://localhost/ws");
        expect(instances).toHaveLength(1);
        expect(ws).toBeInstanceOf(MockWebSocket);
      } finally {
        cleanup();
      }
    });
  });

  describe("jest-dom matchers", () => {
    it("toBeInTheDocument matcher is available", () => {
      // Verify that @testing-library/jest-dom matchers are registered
      const div = document.createElement("div");
      document.body.appendChild(div);
      expect(div).toBeInTheDocument();
      document.body.removeChild(div);
    });
  });
});
