// Prominent banner that appears when WebSocket connection is lost.
// Shows reconnecting status with a manual reconnect button.

import { useConnectionStore } from "@/stores/connectionStore";

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const reconnect = useConnectionStore((s) => s.reconnect);

  if (status === "connected") return null;

  const isReconnecting = status === "reconnecting";

  return (
    <div
      data-testid="connection-banner"
      className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium banner-slide-down"
      style={{
        backgroundColor: isReconnecting
          ? "var(--color-warning)"
          : "var(--color-error)",
        color: "var(--color-white)",
      }}
      role="alert"
    >
      {isReconnecting ? (
        <>
          <svg
            className="w-4 h-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Reconnecting to server...</span>
        </>
      ) : (
        <>
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>Connection lost</span>
          <button
            data-testid="reconnect-btn"
            className="px-3 py-0.5 rounded text-xs font-semibold bg-white/20 hover:bg-white/30 active:scale-95 transition-all"
            onClick={() => reconnect ? reconnect() : window.location.reload()}
          >
            Reconnect
          </button>
        </>
      )}
    </div>
  );
}
