import type { Message } from "@/stores/chatStore";

/**
 * Converts an array of chat messages into a pretty-printed JSON string.
 *
 * - Includes a top-level title, export timestamp, and message count.
 * - Each message includes role, content, timestamp, and any SQL execution data.
 * - SQL executions are mapped to sql_query / sql_results pairs; if a message
 *   has multiple executions, only the first is used for the top-level fields
 *   and all are available in the sql_executions array.
 */
export function exportAsJson(messages: Message[], title: string): string {
  const exportedMessages = messages.map((msg) => {
    const firstExec =
      msg.sql_executions && msg.sql_executions.length > 0
        ? msg.sql_executions[0]
        : null;

    return {
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at,
      sql_query: firstExec?.query ?? null,
      sql_results: firstExec
        ? {
            columns: firstExec.columns ?? [],
            rows: firstExec.rows ?? [],
            total_rows: firstExec.total_rows ?? 0,
          }
        : null,
      ...(msg.sql_executions && msg.sql_executions.length > 1
        ? {
            sql_executions: msg.sql_executions.map((exec) => ({
              query: exec.query,
              columns: exec.columns ?? [],
              rows: exec.rows ?? [],
              total_rows: exec.total_rows ?? 0,
              error: exec.error ?? null,
              execution_time_ms: exec.execution_time_ms ?? null,
            })),
          }
        : {}),
    };
  });

  const output = {
    title,
    exported_at: new Date().toISOString(),
    message_count: messages.length,
    messages: exportedMessages,
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Triggers a browser download for the given JSON content.
 *
 * Creates a temporary Blob URL, clicks a hidden anchor element to
 * initiate the download, then cleans up the URL.
 */
export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
