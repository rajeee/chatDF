import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportAsJson, downloadJson } from "@/utils/exportJson";
import type { Message } from "@/stores/chatStore";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello world",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: "2026-02-08T12:00:00Z",
    ...overrides,
  };
}

describe("exportAsJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces valid JSON", () => {
    const messages: Message[] = [makeMessage()];
    const result = exportAsJson(messages, "Test Conversation");

    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("includes title and metadata fields", () => {
    const messages: Message[] = [makeMessage()];
    const result = JSON.parse(exportAsJson(messages, "My Chat"));

    expect(result.title).toBe("My Chat");
    expect(result.exported_at).toBeDefined();
    expect(typeof result.exported_at).toBe("string");
    // Verify the ISO timestamp is correct (uses fake timer)
    expect(result.exported_at).toBe("2026-02-08T12:00:00.000Z");
    expect(result.message_count).toBe(1);
    expect(result.messages).toHaveLength(1);
  });

  it("includes all message fields", () => {
    const messages: Message[] = [
      makeMessage({ role: "user", content: "What is the average?" }),
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "The average is 42.",
        created_at: "2026-02-08T12:01:00Z",
      }),
    ];

    const result = JSON.parse(exportAsJson(messages, "Test"));

    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("What is the average?");
    expect(result.messages[0].timestamp).toBe("2026-02-08T12:00:00Z");
    expect(result.messages[0].sql_query).toBeNull();
    expect(result.messages[0].sql_results).toBeNull();

    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].content).toBe("The average is 42.");
    expect(result.messages[1].timestamp).toBe("2026-02-08T12:01:00Z");
  });

  it("includes SQL executions when present", () => {
    const messages: Message[] = [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Here are the results.",
        sql_executions: [
          {
            query: "SELECT AVG(price) FROM products",
            columns: ["avg_price"],
            rows: [[42.5]],
            total_rows: 1,
            error: null,
            execution_time_ms: 15,
          },
        ],
      }),
    ];

    const result = JSON.parse(exportAsJson(messages, "SQL Test"));
    const msg = result.messages[0];

    expect(msg.sql_query).toBe("SELECT AVG(price) FROM products");
    expect(msg.sql_results).toEqual({
      columns: ["avg_price"],
      rows: [[42.5]],
      total_rows: 1,
    });
  });

  it("includes full sql_executions array when multiple executions exist", () => {
    const messages: Message[] = [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Two queries ran.",
        sql_executions: [
          {
            query: "SELECT 1",
            columns: ["col"],
            rows: [[1]],
            total_rows: 1,
            error: null,
            execution_time_ms: 5,
          },
          {
            query: "SELECT 2",
            columns: ["col"],
            rows: [[2]],
            total_rows: 1,
            error: null,
            execution_time_ms: 10,
          },
        ],
      }),
    ];

    const result = JSON.parse(exportAsJson(messages, "Multi SQL"));
    const msg = result.messages[0];

    // Top-level fields reflect the first execution
    expect(msg.sql_query).toBe("SELECT 1");
    // Full array is present when multiple executions exist
    expect(msg.sql_executions).toHaveLength(2);
    expect(msg.sql_executions[0].query).toBe("SELECT 1");
    expect(msg.sql_executions[1].query).toBe("SELECT 2");
  });

  it("handles empty messages array", () => {
    const result = JSON.parse(exportAsJson([], "Empty"));

    expect(result.title).toBe("Empty");
    expect(result.message_count).toBe(0);
    expect(result.messages).toHaveLength(0);
  });

  it("outputs pretty-printed JSON (indented)", () => {
    const messages: Message[] = [makeMessage()];
    const result = exportAsJson(messages, "Pretty");

    // Pretty-printed JSON has newlines and indentation
    expect(result).toContain("\n");
    expect(result).toContain("  ");
  });
});

describe("downloadJson", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createElementSpy = vi.spyOn(document, "createElement");
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL — stub them
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    URL.revokeObjectURL = vi.fn();
    createObjectURLSpy = URL.createObjectURL as ReturnType<typeof vi.fn>;
    revokeObjectURLSpy = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and clicks a download link and revokes the URL", () => {
    downloadJson('{"test": true}', "export.json");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("creates a Blob with application/json content type", () => {
    downloadJson("{}", "test.json");

    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("application/json;charset=utf-8;");
  });
});
