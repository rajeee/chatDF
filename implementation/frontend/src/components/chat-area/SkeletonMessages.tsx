// Skeleton placeholder bubbles shown while conversation messages are loading.
// Mimics the alternating user/assistant message layout.

export function SkeletonMessages() {
  return (
    <div
      data-testid="skeleton-messages"
      className="px-2 py-2 sm:px-4 sm:py-4 space-y-3 sm:space-y-4"
      role="status"
      aria-label="Loading messages"
    >
      {/* Skeleton user message */}
      <div className="flex flex-col items-end animate-pulse">
        <div
          className="max-w-[60%] rounded-lg px-4 py-3 h-10"
          style={{ backgroundColor: "var(--color-accent)", opacity: 0.3 }}
        />
        <div
          className="h-3 w-16 mt-1 rounded"
          style={{ backgroundColor: "var(--color-border)" }}
        />
      </div>

      {/* Skeleton assistant message */}
      <div className="flex flex-col items-start animate-pulse">
        <div
          className="max-w-[70%] rounded-lg px-4 py-3 space-y-2"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className="h-3 rounded"
            style={{ backgroundColor: "var(--color-border)", width: "90%" }}
          />
          <div
            className="h-3 rounded"
            style={{ backgroundColor: "var(--color-border)", width: "75%" }}
          />
          <div
            className="h-3 rounded"
            style={{ backgroundColor: "var(--color-border)", width: "60%" }}
          />
        </div>
        <div
          className="h-3 w-16 mt-1 rounded"
          style={{ backgroundColor: "var(--color-border)" }}
        />
      </div>

      {/* Second skeleton user message */}
      <div className="flex flex-col items-end animate-pulse">
        <div
          className="max-w-[50%] rounded-lg px-4 py-3 h-8"
          style={{ backgroundColor: "var(--color-accent)", opacity: 0.3 }}
        />
        <div
          className="h-3 w-16 mt-1 rounded"
          style={{ backgroundColor: "var(--color-border)" }}
        />
      </div>

      {/* Second skeleton assistant message */}
      <div className="flex flex-col items-start animate-pulse">
        <div
          className="max-w-[65%] rounded-lg px-4 py-3 space-y-2"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className="h-3 rounded"
            style={{ backgroundColor: "var(--color-border)", width: "85%" }}
          />
          <div
            className="h-3 rounded"
            style={{ backgroundColor: "var(--color-border)", width: "70%" }}
          />
        </div>
        <div
          className="h-3 w-16 mt-1 rounded"
          style={{ backgroundColor: "var(--color-border)" }}
        />
      </div>
    </div>
  );
}
