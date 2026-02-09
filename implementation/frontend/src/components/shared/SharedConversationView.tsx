// SharedConversationView - read-only public view of a shared conversation.
//
// Fetches /shared/{share_token} and displays messages in a simplified
// read-only format. No chat input, no streaming, no side panels.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGetPublic } from "@/api/client";
import ReactMarkdown from "react-markdown";

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

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <Header />
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

  if (error || !conversation) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <Header />
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

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <Header />

      {/* Title and metadata bar */}
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="max-w-3xl mx-auto">
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {conversation.title || "Untitled Conversation"}
          </h1>
          <div
            className="flex items-center gap-3 mt-1 text-xs"
            style={{ color: "var(--color-muted)" }}
          >
            <span>
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
        >
          <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
            {conversation.datasets.map((ds) => (
              <span
                key={ds.id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
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
                  ({ds.row_count} rows, {ds.column_count} cols)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {conversation.messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className="max-w-[80%] rounded-lg px-4 py-2 text-sm break-words"
                  style={{
                    backgroundColor: isUser
                      ? "var(--color-accent)"
                      : "var(--color-surface)",
                    color: isUser
                      ? "var(--color-white)"
                      : "var(--color-text)",
                    border: isUser
                      ? "none"
                      : "1px solid var(--color-border)",
                    boxShadow: isUser
                      ? "none"
                      : "0 1px 2px var(--color-shadow)",
                  }}
                >
                  {isUser ? (
                    <span className="break-words">{message.content}</span>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
                <span
                  className="text-xs mt-1 opacity-30"
                  style={{ color: "var(--color-text)" }}
                >
                  {new Date(message.created_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        className="border-t px-4 py-3 text-center"
        style={{ borderColor: "var(--color-border)" }}
      >
        <p
          className="text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          This is a read-only view of a shared ChatDF conversation.{" "}
          <Link
            to="/"
            className="underline hover:opacity-80 transition-opacity"
            style={{ color: "var(--color-accent)" }}
          >
            Try ChatDF
          </Link>
        </p>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header
      className="border-b px-4 py-3 flex items-center gap-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
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
