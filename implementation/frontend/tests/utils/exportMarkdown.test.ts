import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportAsMarkdown, downloadMarkdown } from "@/utils/exportMarkdown";
import type { Message } from "@/stores/chatStore";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: "2026-02-08T12:00:00Z",
    ...overrides,
  };
}

describe("exportAsMarkdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render a title header and export footer", () => {
    const md = exportAsMarkdown([], "My Chat");

    expect(md).toContain("# My Chat");
    expect(md).toContain("---");
    expect(md).toContain("*Exported from ChatDF on");
  });

  it("should return header and footer for empty messages array", () => {
    const md = exportAsMarkdown([], "Empty");

    expect(md.startsWith("# Empty\n")).toBe(true);
    expect(md).toContain("---");
    // Should not contain any ## headers
    expect(md).not.toContain("## User");
    expect(md).not.toContain("## Assistant");
  });

  it("should render user messages with ## User header", () => {
    const messages: Message[] = [
      makeMessage({ role: "user", content: "What is the average price?" }),
    ];

    const md = exportAsMarkdown(messages, "Test");

    expect(md).toContain("## User");
    expect(md).toContain("What is the average price?");
  });

  it("should render assistant messages with ## Assistant header", () => {
    const messages: Message[] = [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "The average price is $42.50.",
      }),
    ];

    const md = exportAsMarkdown(messages, "Test");

    expect(md).toContain("## Assistant");
    expect(md).toContain("The average price is $42.50.");
  });

  it("should render multiple messages in order", () => {
    const messages: Message[] = [
      makeMessage({ id: "msg-1", role: "user", content: "Question one" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "Answer one" }),
      makeMessage({ id: "msg-3", role: "user", content: "Question two" }),
    ];

    const md = exportAsMarkdown(messages, "Multi");

    const userIdx1 = md.indexOf("Question one");
    const assistantIdx = md.indexOf("Answer one");
    const userIdx2 = md.indexOf("Question two");

    expect(userIdx1).toBeLessThan(assistantIdx);
    expect(assistantIdx).toBeLessThan(userIdx2);
  });

  it("should include SQL executions as fenced code blocks", () => {
    const messages: Message[] = [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Here are the results.",
        sql_executions: [
          {
            query: "SELECT * FROM products WHERE price > 100",
            columns: ["id", "name", "price"],
            rows: [[1, "Widget", 150]],
            total_rows: 1,
            error: null,
            execution_time_ms: 12,
          },
        ],
      }),
    ];

    const md = exportAsMarkdown(messages, "SQL Test");

    expect(md).toContain("```sql");
    expect(md).toContain("SELECT * FROM products WHERE price > 100");
    expect(md).toContain("```");
  });

  it("should include multiple SQL executions for a single message", () => {
    const messages: Message[] = [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Multiple queries.",
        sql_executions: [
          {
            query: "SELECT COUNT(*) FROM users",
            columns: null,
            rows: null,
            total_rows: null,
            error: null,
            execution_time_ms: null,
          },
          {
            query: "SELECT AVG(age) FROM users",
            columns: null,
            rows: null,
            total_rows: null,
            error: null,
            execution_time_ms: null,
          },
        ],
      }),
    ];

    const md = exportAsMarkdown(messages, "Multi SQL");

    const sqlBlocks = md.match(/```sql/g);
    expect(sqlBlocks).toHaveLength(2);
    expect(md).toContain("SELECT COUNT(*) FROM users");
    expect(md).toContain("SELECT AVG(age) FROM users");
  });

  it("should skip SQL executions with empty query strings", () => {
    const messages: Message[] = [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "No real query.",
        sql_executions: [
          {
            query: "",
            columns: null,
            rows: null,
            total_rows: null,
            error: null,
            execution_time_ms: null,
          },
        ],
      }),
    ];

    const md = exportAsMarkdown(messages, "Empty SQL");

    expect(md).not.toContain("```sql");
  });

  it("should not include SQL blocks for user messages", () => {
    const messages: Message[] = [
      makeMessage({
        role: "user",
        content: "Show me a query",
        sql_executions: [],
      }),
    ];

    const md = exportAsMarkdown(messages, "User Only");

    expect(md).not.toContain("```sql");
  });
});

describe("downloadMarkdown", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

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

  it("should create a download link, click it, and revoke the URL", () => {
    downloadMarkdown("# Test content", "test.md");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("should create a Blob with text/markdown content type", () => {
    downloadMarkdown("# Hello", "export.md");

    // Verify the Blob was created and passed to createObjectURL
    const blobArg = (createObjectURLSpy as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("text/markdown;charset=utf-8;");
  });
});
