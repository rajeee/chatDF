// ShareDialog component for generating and managing shareable conversation links.
//
// Shows a dialog/popover with:
// - The shareable URL with a "Copy Link" button
// - A "Stop Sharing" button to revoke access
// - Loading and error states

import { useState, useCallback, useEffect, useRef } from "react";
import { apiPost, apiDelete } from "@/api/client";

interface ShareDialogProps {
  conversationId: string;
  onClose: () => void;
}

interface ShareResponse {
  share_token: string;
  share_url: string;
}

export function ShareDialog({ conversationId, onClose }: ShareDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleShare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiPost<ShareResponse>(
        `/conversations/${conversationId}/share`
      );
      setShareToken(resp.share_token);
      // Build frontend URL from the token
      const frontendUrl = `${window.location.origin}/share/${resp.share_token}`;
      setShareUrl(frontendUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleUnshare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiDelete(`/conversations/${conversationId}/share`);
      setShareUrl(null);
      setShareToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share link");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Auto-generate share link on mount
  useEffect(() => {
    handleShare();
  }, [handleShare]);

  return (
    <div
      ref={dialogRef}
      className="absolute right-0 top-full mt-2 w-80 rounded-lg border shadow-lg z-50 p-4"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
      role="dialog"
      aria-label="Share conversation"
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--color-text)" }}
        >
          Share Conversation
        </h3>
        <button
          className="p-1 rounded hover:bg-gray-500/10 transition-colors"
          onClick={onClose}
          aria-label="Close share dialog"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--color-muted)" }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {error && (
        <div
          className="text-xs px-3 py-2 rounded mb-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-error) 10%, transparent)",
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
          }}
        >
          {error}
        </div>
      )}

      {loading && !shareUrl && (
        <div
          className="text-xs py-4 text-center"
          style={{ color: "var(--color-muted)" }}
        >
          Generating share link...
        </div>
      )}

      {shareUrl && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex-1 text-xs px-3 py-2 rounded font-mono truncate"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              title={shareUrl}
            >
              {shareUrl}
            </div>
            <button
              className="px-3 py-2 rounded text-xs font-medium transition-all duration-150 hover:opacity-90 active:scale-95 flex-shrink-0"
              style={{
                backgroundColor: copied ? "var(--color-success)" : "var(--color-accent)",
                color: "var(--color-white)",
              }}
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span
              className="text-xs flex items-center gap-1.5"
              style={{ color: "var(--color-success)" }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="6" />
              </svg>
              Shared
            </span>
            <button
              className="text-xs px-2 py-1 rounded border hover:opacity-80 active:scale-95 transition-all duration-150"
              style={{
                borderColor: "var(--color-error)",
                color: "var(--color-error)",
              }}
              onClick={handleUnshare}
              disabled={loading}
            >
              Stop Sharing
            </button>
          </div>

          <p
            className="text-xs mt-2 opacity-60"
            style={{ color: "var(--color-muted)" }}
          >
            Anyone with this link can view this conversation (read-only).
          </p>
        </>
      )}
    </div>
  );
}
