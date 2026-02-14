// SharedConversationView - read-only public view of a shared conversation.
//
// Fetches /shared/{share_token} and displays messages in a simplified
// read-only format. No chat input, no streaming, no side panels.
// Supports markdown rendering with code blocks, collapsible SQL previews,
// and inline chart visualizations.

import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGetPublic } from "@/api/client";
import ReactMarkdown from "react-markdown";
import { parseSqlExecutions, type SqlExecution } from "@/stores/chatStore";

const ChartVisualization = lazy(() =>
  import("@/components/chat-area/ChartVisualization").then((m) => ({
    default: m.ChartVisualization,
  }))
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SharedMessage {
  id: string;
  role: string;
  content: string;
  sql_query: string | null;
  reasoning: string | null;
  created_at: string;
}

interface SharedDataset {
  id: string;
  name: string;
  url: string;
  row_count: number;
  column_count: number;
  status: string;
  schema_json: string;
}

interface SharedConversation {
  title: string;
  messages: SharedMessage[];
  datasets: SharedDataset[];
  shared_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Inline code block for markdown (lightweight, no toast store dependency)
// ---------------------------------------------------------------------------

interface SharedCodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function SharedCodeBlock({ inline, className, children, ...props }: SharedCodeBlockProps) {
  const language = className?.replace(/^language-/, "") || "";
  const codeText = String(children).replace(/\n$/, "");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore copy failures in shared view
    }
  };

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="relative group/code my-2">
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs rounded-t"
        style={{ backgroundColor: "var(--color-surface-hover)" }}
      >
        <span className="font-mono opacity-60">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="px-2 py-1 rounded text-xs opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 transition-all duration-150 flex items-center gap-1.5 hover:bg-white/10 active:scale-95"
          style={{ color: "var(--color-text)" }}
          aria-label="Copy code"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {copied ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </>
            )}
          </svg>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="m-0 p-3 overflow-x-auto rounded-b"
        style={{ backgroundColor: "var(--color-surface-hover)" }}
      >
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible SQL Preview
// ---------------------------------------------------------------------------

function SqlPreview({ sql, messageId }: { sql: string; messageId: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid={`sql-preview-${messageId}`}
      className="mt-2 rounded overflow-hidden text-xs"
      style={{
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      <button
        data-testid={`sql-preview-toggle-${messageId}`}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: "var(--color-text)" }}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-mono opacity-70">SQL</span>
      </button>
      <div
        data-testid={`sql-preview-content-${messageId}`}
        style={{
          maxHeight: expanded ? "200px" : "0px",
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 200ms ease, opacity 200ms ease",
        }}
      >
        <pre
          className="px-2 py-1.5 overflow-x-auto font-mono border-t"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
            fontSize: "0.7rem",
            lineHeight: "1.4",
            maxHeight: "120px",
            overflowY: "auto",
          }}
        >
          {sql}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Result Table (compact, read-only)
// ---------------------------------------------------------------------------

function SharedResultTable({ exec }: { exec: SqlExecution }) {
  const [expanded, setExpanded] = useState(false);
  if (!exec.columns || !exec.rows || exec.rows.length === 0) return null;

  const displayRows = expanded ? exec.rows.slice(0, 100) : exec.rows.slice(0, 5);

  return (
    <div
      className="mt-2 rounded overflow-hidden text-xs"
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {exec.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-left font-medium whitespace-nowrap"
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.65rem",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri}>
                {(row as unknown[]).map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-2 py-0.5 whitespace-nowrap"
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      fontSize: "0.65rem",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {cell == null ? (
                      <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>null</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-muted)" }}
      >
        <span style={{ fontSize: "0.6rem" }}>
          {exec.total_rows != null ? exec.total_rows.toLocaleString() : exec.rows.length} rows
          {exec.execution_time_ms != null && ` \u00B7 ${exec.execution_time_ms.toFixed(0)}ms`}
        </span>
        {exec.rows.length > 5 && (
          <button
            className="text-xs hover:underline"
            style={{ color: "var(--color-accent)", fontSize: "0.6rem" }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : `Show ${Math.min(exec.rows.length, 100)} rows`}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema Info (expandable per-dataset)
// ---------------------------------------------------------------------------

function DatasetSchemaInfo({ dataset }: { dataset: SharedDataset }) {
  const [expanded, setExpanded] = useState(false);

  let columns: { name: string; dtype: string }[] = [];
  try {
    columns = JSON.parse(dataset.schema_json);
  } catch {
    // schema_json may not be valid
  }

  if (columns.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        className="text-xs opacity-50 hover:opacity-80 transition-opacity flex items-center gap-1"
        style={{ color: "var(--color-text)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-2.5 h-2.5 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {columns.length} columns
      </button>
      {expanded && (
        <div
          className="mt-1 text-xs font-mono flex flex-wrap gap-x-3 gap-y-0.5 pl-3.5"
          style={{ color: "var(--color-muted)" }}
        >
          {columns.map((col) => (
            <span key={col.name}>
              {col.name}
              <span className="opacity-50"> ({col.dtype})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble (with parsed sql_executions, tables, charts)
// ---------------------------------------------------------------------------

function SharedMessageBubble({ message }: { message: SharedMessage }) {
  const isUser = message.role === "user";
  const executions = useMemo(
    () => (isUser ? [] : parseSqlExecutions(message.sql_query)),
    [message.sql_query, isUser]
  );
  const hasResults = executions.some(
    (e) => e.columns && e.rows && e.rows.length > 0 && !e.error
  );
  const hasChart = executions.some(
    (e) => e.chartSpec && e.columns && e.rows
  );

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
      data-testid={`message-${message.id}`}
    >
      <div
        className="max-w-[80%] rounded-lg px-4 py-2 text-sm break-words"
        style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-surface)",
          color: isUser ? "var(--color-white)" : "var(--color-text)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          boxShadow: isUser ? "none" : "0 1px 2px var(--color-shadow)",
        }}
      >
        {isUser ? (
          <span className="break-words">{message.content}</span>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
              components={{
                code: SharedCodeBlock,
                p: ({ children }) => {
                  if (
                    children &&
                    typeof children === "object" &&
                    "type" in children &&
                    children.type === "div"
                  ) {
                    return <>{children}</>;
                  }
                  return <p>{children}</p>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* SQL preview + result tables (rich JSON format) */}
        {!isUser && hasResults &&
          executions.map((exec, i) => (
            <div key={i}>
              <SqlPreview sql={exec.query} messageId={`${message.id}-${i}`} />
              {exec.error && (
                <div
                  className="mt-1 text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: "var(--color-error-bg, #fef2f2)",
                    color: "var(--color-error, #dc2626)",
                    border: "1px solid var(--color-error-border, #fecaca)",
                  }}
                >
                  {exec.error}
                </div>
              )}
              {!exec.error && <SharedResultTable exec={exec} />}
            </div>
          ))}

        {/* Legacy/plain SQL preview (no result data) */}
        {!isUser && message.sql_query && !hasResults && (
          <SqlPreview sql={executions.length > 0 ? executions[0].query : message.sql_query} messageId={message.id} />
        )}
      </div>

      {/* Inline chart visualization */}
      {!isUser && hasChart && (
        <div
          className="max-w-[80%] mt-1 rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            height: "260px",
          }}
          data-testid={`shared-chart-${message.id}`}
        >
          <Suspense
            fallback={
              <div
                className="flex items-center justify-center h-full text-xs"
                style={{ color: "var(--color-muted)" }}
              >
                Loading chart...
              </div>
            }
          >
            {executions
              .filter((e) => e.chartSpec && e.columns && e.rows)
              .map((exec, i) => (
                <ChartVisualization
                  key={i}
                  columns={exec.columns!}
                  rows={exec.rows!}
                  llmSpec={exec.chartSpec}
                />
              ))}
          </Suspense>
        </div>
      )}

      {/* Auto-detected chart for results without explicit chartSpec */}
      {!isUser && hasResults && !hasChart && (
        <div
          className="max-w-[80%] mt-1 rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            height: "220px",
          }}
          data-testid={`shared-auto-chart-${message.id}`}
        >
          <Suspense
            fallback={
              <div
                className="flex items-center justify-center h-full text-xs"
                style={{ color: "var(--color-muted)" }}
              >
                Loading chart...
              </div>
            }
          >
            {(() => {
              const exec = executions.find(
                (e) => e.columns && e.rows && e.rows.length > 0 && !e.error
              );
              return exec ? (
                <ChartVisualization columns={exec.columns!} rows={exec.rows!} />
              ) : null;
            })()}
          </Suspense>
        </div>
      )}

      <span
        className="text-xs mt-1 opacity-30"
        style={{ color: "var(--color-text)" }}
      >
        {formatTime(message.created_at)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SharedConversationView() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [conversation, setConversation] = useState<SharedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchConversation() {
      try {
        const data = await apiGetPublic<SharedConversation>(
          `/shared/${shareToken}`
        );
        if (!cancelled) {
          setConversation(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message.includes("404")
              ? "This shared conversation was not found or has been unshared."
              : "Failed to load shared conversation."
          );
          setLoading(false);
        }
      }
    }

    fetchConversation();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  // --- Loading state ---
  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <SharedHeader />
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-sm animate-pulse"
            style={{ color: "var(--color-muted)" }}
          >
            Loading shared conversation...
          </p>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error || !conversation) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <SharedHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 px-4">
            <svg
              className="mx-auto"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--color-muted)" }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p
              className="text-sm"
              style={{ color: "var(--color-muted)" }}
              data-testid="error-message"
            >
              {error || "Conversation not found"}
            </p>
            <Link
              to="/"
              className="inline-block text-sm px-4 py-2 rounded transition-colors"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-white)",
              }}
            >
              Go to ChatDF
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Success state ---
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <SharedHeader />

      {/* Title and metadata bar */}
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
              data-testid="conversation-title"
            >
              {conversation.title || "Untitled Conversation"}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded flex-shrink-0"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-muted)",
                border: "1px solid var(--color-border)",
              }}
            >
              Shared conversation
            </span>
          </div>
          <div
            className="flex items-center gap-3 mt-1 text-xs"
            style={{ color: "var(--color-muted)" }}
          >
            <span data-testid="shared-at">
              Shared {formatDate(conversation.shared_at)}
            </span>
            <span>
              {conversation.messages.length} message{conversation.messages.length !== 1 ? "s" : ""}
            </span>
            {conversation.datasets.length > 0 && (
              <span>
                {conversation.datasets.length} dataset{conversation.datasets.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dataset info */}
      {conversation.datasets.length > 0 && (
        <div
          className="border-b px-4 py-2"
          style={{ borderColor: "var(--color-border)" }}
          data-testid="datasets-section"
        >
          <div className="max-w-3xl mx-auto space-y-1">
            {conversation.datasets.map((ds) => (
              <div key={ds.id}>
                <span
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                  data-testid={`dataset-${ds.id}`}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                  {ds.name}
                  <span style={{ color: "var(--color-muted)" }}>
                    ({ds.row_count.toLocaleString()} rows, {ds.column_count} cols)
                  </span>
                </span>
                <DatasetSchemaInfo dataset={ds} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {conversation.messages.map((message) => (
            <SharedMessageBubble key={message.id} message={message} />
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div
        className="border-t px-4 py-4 text-center"
        style={{ borderColor: "var(--color-border)" }}
      >
        <p
          className="text-sm mb-2"
          style={{ color: "var(--color-text)" }}
        >
          Explore your own data with ChatDF
        </p>
        <Link
          to="/"
          className="inline-block text-sm px-5 py-2 rounded font-medium transition-all duration-150 hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-white)",
          }}
          data-testid="try-chatdf-link"
        >
          Try ChatDF
        </Link>
        <p
          className="text-xs mt-2"
          style={{ color: "var(--color-muted)" }}
        >
          This is a read-only view of a shared conversation.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared Header
// ---------------------------------------------------------------------------

function SharedHeader() {
  return (
    <header
      className="border-b px-4 py-3 flex items-center gap-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
      data-testid="shared-header"
    >
      <Link
        to="/"
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <span
          className="text-lg font-bold"
          style={{ color: "var(--color-text)" }}
        >
          ChatDF
        </span>
      </Link>
      <span
        className="text-xs px-2 py-0.5 rounded"
        style={{
          backgroundColor: "var(--color-bg)",
          color: "var(--color-muted)",
          border: "1px solid var(--color-border)",
        }}
      >
        Shared
      </span>
    </header>
  );
}
