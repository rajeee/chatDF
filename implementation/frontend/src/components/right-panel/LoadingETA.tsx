// Elapsed time display for datasets in loading state.
// Shows incrementing seconds with reassuring messages at thresholds.

import { useEffect, useState } from "react";
import { useDatasetStore } from "@/stores/datasetStore";

interface LoadingETAProps {
  datasetId: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function getMessage(seconds: number): string {
  if (seconds >= 60) return "This is taking longer than usual";
  if (seconds >= 30) return "Still working...";
  if (seconds >= 5) return "Large datasets may take a moment";
  return "";
}

export function LoadingETA({ datasetId }: LoadingETAProps) {
  const startTime = useDatasetStore(
    (s) => s.loadingStartTimes[datasetId]
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startTime == null) return;

    // Calculate initial elapsed to handle re-renders
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  if (startTime == null) return null;

  const message = getMessage(elapsed);

  return (
    <div
      data-testid="loading-eta"
      className="mt-1 text-xs"
      style={{ color: "var(--color-text-secondary)" }}
    >
      Loading... {formatElapsed(elapsed)}
      {message && (
        <span data-testid="loading-eta-message">
          {" "}&mdash; {message}
        </span>
      )}
    </div>
  );
}
