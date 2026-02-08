import type { Message } from "@/stores/chatStore";

/**
 * Converts an array of chat messages into a Markdown string.
 *
 * - Renders a `# {title}` header at the top.
 * - Each message becomes a `## User` or `## Assistant` section.
 * - For assistant messages that have SQL executions, the SQL queries
 *   are appended as fenced ```sql code blocks after the message content.
 * - A footer with the export timestamp is appended at the end.
 */
export function exportAsMarkdown(messages: Message[], title: string): string {
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");

  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "User" : "Assistant";
    lines.push(`## ${roleLabel}`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");

    // Include SQL executions for assistant messages
    if (msg.sql_executions && msg.sql_executions.length > 0) {
      for (const exec of msg.sql_executions) {
        if (exec.query) {
          lines.push("```sql");
          lines.push(exec.query);
          lines.push("```");
          lines.push("");
        }
      }
    }
  }

  lines.push("---");
  lines.push(`*Exported from ChatDF on ${new Date().toLocaleDateString()}*`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Triggers a browser download for the given Markdown content.
 *
 * Creates a temporary Blob URL, clicks a hidden anchor element to
 * initiate the download, then cleans up the URL.
 */
export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
