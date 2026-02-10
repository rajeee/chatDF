import { useState, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { apiPost } from "@/api/client";

interface TokenBreakdown {
  system_prompt: number;
  messages: Array<{ role: string; tokens: number }>;
  tools: number;
  new_message: number;
  total: number;
}

interface PromptPreviewData {
  system_prompt: string;
  messages: Array<{ role: string; content: string }>;
  tools: string[];
  new_message: string;
  estimated_tokens: number;
  token_breakdown?: TokenBreakdown;
}

interface PromptPreviewModalProps {
  open: boolean;
  onClose: () => void;
  inputValue: string;
}

export function PromptPreviewModal({ open, onClose, inputValue }: PromptPreviewModalProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const [data, setData] = useState<PromptPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"system" | "history" | "tools">("system");
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (!activeConversationId || !inputValue.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<PromptPreviewData>(
        `/conversations/${activeConversationId}/prompt-preview`,
        { content: inputValue.trim() }
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch preview");
    } finally {
      setLoading(false);
    }
  }, [activeConversationId, inputValue]);

  // Fetch on open
  if (open && !data && !loading && !error) {
    fetchPreview();
  }

  if (!open) return null;

  // Format token count
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const bd = data?.token_breakdown;
  const messagesTotalTokens = bd ? bd.messages.reduce((sum, m) => sum + m.tokens, 0) : 0;

  // Bar segment data for the stacked visualization
  const barSegments = bd && bd.total > 0
    ? [
        { label: "System", value: bd.system_prompt, opacity: 1.0 },
        { label: "Messages", value: messagesTotalTokens, opacity: 0.7 },
        { label: "Tools", value: bd.tools, opacity: 0.45 },
        { label: "New msg", value: bd.new_message, opacity: 0.25 },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--color-backdrop)" }}
      onClick={onClose}
    >
      <div
        data-testid="prompt-preview-modal"
        className="w-full max-w-3xl max-h-[80vh] rounded-lg shadow-xl flex flex-col mx-4"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Prompt Preview</h2>
            {data && (
              <button
                onClick={() => setBreakdownOpen((v) => !v)}
                className="text-xs px-2 py-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--color-accent)", color: "white", opacity: 0.85 }}
                title="Click to toggle token breakdown"
              >
                ~{formatTokens(data.estimated_tokens)} tokens {breakdownOpen ? "\u25B2" : "\u25BC"}
              </button>
            )}
          </div>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Token Breakdown (collapsible) */}
        {data && bd && breakdownOpen && (
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}
            data-testid="token-breakdown"
          >
            {/* Stacked horizontal bar */}
            {bd.total > 0 && (
              <div
                className="flex rounded overflow-hidden mb-2"
                style={{ height: "8px", backgroundColor: "var(--color-border)" }}
              >
                {barSegments.map((seg) =>
                  seg.value > 0 ? (
                    <div
                      key={seg.label}
                      title={`${seg.label}: ${formatTokens(seg.value)}`}
                      style={{
                        width: `${(seg.value / bd.total) * 100}%`,
                        backgroundColor: "var(--color-accent)",
                        opacity: seg.opacity,
                      }}
                    />
                  ) : null
                )}
              </div>
            )}

            {/* Itemized list */}
            <div className="space-y-1" style={{ color: "var(--color-text)", fontSize: "11px", lineHeight: "1.4" }}>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-accent)", opacity: 1.0 }} />
                  System prompt
                </span>
                <span className="tabular-nums opacity-70">{formatTokens(bd.system_prompt)}</span>
              </div>

              <div className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-accent)", opacity: 0.7 }} />
                  Messages ({bd.messages.length} turn{bd.messages.length !== 1 ? "s" : ""})
                </span>
                <span className="tabular-nums opacity-70">{formatTokens(messagesTotalTokens)}</span>
              </div>

              {/* Per-message sub-items */}
              {bd.messages.length > 0 && (
                <div className="pl-5 space-y-0.5" style={{ opacity: 0.6 }}>
                  {bd.messages.map((m, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{m.role}</span>
                      <span className="tabular-nums">{formatTokens(m.tokens)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-accent)", opacity: 0.45 }} />
                  Tools
                </span>
                <span className="tabular-nums opacity-70">{formatTokens(bd.tools)}</span>
              </div>

              <div className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-accent)", opacity: 0.25 }} />
                  New message
                </span>
                <span className="tabular-nums opacity-70">{formatTokens(bd.new_message)}</span>
              </div>

              <div
                className="flex justify-between font-semibold pt-1 mt-1 border-t"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span>Total</span>
                <span className="tabular-nums">{formatTokens(bd.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b px-4" style={{ borderColor: "var(--color-border)" }}>
          {(["system", "history", "tools"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {tab === "system" ? "System Prompt" : tab === "history" ? `History (${data?.messages.length ?? 0})` : `Tools (${data?.tools.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-sm opacity-50">Loading preview...</div>}
          {error && <div className="text-sm" style={{ color: "var(--color-error)" }}>{error}</div>}
          {data && activeTab === "system" && (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words" style={{ color: "var(--color-text)" }}>
              {data.system_prompt}
            </pre>
          )}
          {data && activeTab === "history" && (
            <div className="space-y-3">
              {data.messages.map((m, i) => (
                <div key={i} className={`text-xs rounded p-2 ${m.role === "user" ? "ml-8" : "mr-8"}`}
                  style={{
                    backgroundColor: m.role === "user" ? "var(--color-accent)" : "var(--color-bg)",
                    color: m.role === "user" ? "white" : "var(--color-text)",
                    border: m.role === "user" ? "none" : "1px solid var(--color-border)",
                  }}
                >
                  <div className="font-semibold opacity-70 mb-1">{m.role}</div>
                  <div className="whitespace-pre-wrap break-words">{m.content.slice(0, 500)}{m.content.length > 500 ? "..." : ""}</div>
                </div>
              ))}
              {/* New message */}
              <div className="ml-8 text-xs rounded p-2" style={{ backgroundColor: "var(--color-accent)", color: "white", border: "2px dashed rgba(255,255,255,0.3)" }}>
                <div className="font-semibold opacity-70 mb-1">user (new)</div>
                <div className="whitespace-pre-wrap break-words">{data.new_message}</div>
              </div>
            </div>
          )}
          {data && activeTab === "tools" && (
            <div className="space-y-2">
              {data.tools.map((tool, i) => (
                <div key={i} className="text-xs font-mono px-3 py-2 rounded" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                  {tool}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
