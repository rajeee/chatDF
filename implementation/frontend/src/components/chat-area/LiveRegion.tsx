// Visually hidden ARIA live region for announcing chat events to screen readers.
// Pattern: render a sr-only element with role="status" and aria-live="polite".
// Update its text content when events occur — screen readers will announce changes.

import { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";

export function LiveRegion() {
  const [announcement, setAnnouncement] = useState("");
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);

  // Track streaming completion
  useEffect(() => {
    // When streaming transitions from true to false, announce completion
    // We use a ref-less approach: this effect runs when isStreaming changes
    if (!isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant") {
        const errorExecs = lastMsg.sql_executions?.filter(e => e.error) ?? [];
        if (errorExecs.length > 0) {
          setAnnouncement(`Query error: ${errorExecs[0].error}`);
        } else if (lastMsg.sql_executions?.length > 0) {
          const rowCount = lastMsg.sql_executions.reduce((sum, e) => sum + (e.rows?.length ?? 0), 0);
          setAnnouncement(`Response complete. ${rowCount} rows returned.`);
        } else {
          setAnnouncement("Response complete.");
        }
        // Clear after a short delay so subsequent identical announcements still trigger
        const timer = setTimeout(() => setAnnouncement(""), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [isStreaming, messages]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-region"
      className="sr-only"
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {announcement}
    </div>
  );
}
