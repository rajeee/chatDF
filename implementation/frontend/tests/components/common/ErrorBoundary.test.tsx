// Tests: ErrorBoundary component
//
// Verifies:
// - Catches errors from child components
// - Displays fallback UI with error details
// - Provides reset and reload actions
// - Logs errors to console

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

// Component that throws an error when shouldThrow is true
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>No error</div>;
}

beforeEach(() => {
  // Suppress console.error for these tests (ErrorBoundary logs errors)
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Child component</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Child component")).toBeInTheDocument();
  });

  it("catches error and displays fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        /An unexpected error occurred. This has been logged and we'll look into it./
      )
    ).toBeInTheDocument();
  });

  it("displays error details in expandable section", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Error details")).toBeInTheDocument();
    expect(screen.getByText(/Test error message/)).toBeInTheDocument();
  });

  it("provides 'Return to Home' button", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: /Return to Home/i });
    expect(homeButton).toBeInTheDocument();
  });

  it("provides 'Reload Page' button", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole("button", { name: /Reload Page/i });
    expect(reloadButton).toBeInTheDocument();
  });

  it("navigates to home when 'Return to Home' is clicked", async () => {
    const user = userEvent.setup();

    // Track href assignment
    let assignedHref = "";
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        get href() { return assignedHref; },
        set href(v: string) { assignedHref = v; },
        reload: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: /Return to Home/i });
    await user.click(homeButton);

    expect(assignedHref).toBe("/");
  });

  it("reloads page when 'Reload Page' is clicked", async () => {
    const user = userEvent.setup();

    const mockReload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: mockReload, href: "" },
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole("button", { name: /Reload Page/i });
    await user.click(reloadButton);

    expect(mockReload).toHaveBeenCalled();
  });

  it("logs error to console when caught", () => {
    const consoleErrorSpy = vi.spyOn(console, "error");

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    // React logs error boundaries, our componentDidCatch also logs
    const calls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("ErrorBoundary caught an error:"))).toBe(true);
  });

  it("displays warning icon in fallback UI", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Check for SVG warning icon
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
