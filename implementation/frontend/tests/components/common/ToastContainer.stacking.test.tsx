import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastContainer } from "@/components/common/ToastContainer";
import { useToastStore } from "@/stores/toastStore";

describe("ToastContainer - stacking limit", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders at most 3 toasts when many are added", () => {
    // Add 5 toasts directly to state
    useToastStore.setState({
      toasts: [
        { id: "1", message: "Toast 1", type: "info" },
        { id: "2", message: "Toast 2", type: "info" },
        { id: "3", message: "Toast 3", type: "info" },
        { id: "4", message: "Toast 4", type: "info" },
        { id: "5", message: "Toast 5", type: "info" },
      ],
    });

    render(<ToastContainer />);
    const toasts = screen.getAllByTestId("toast-info");
    expect(toasts.length).toBe(3);
  });

  it("shows the most recent toasts", () => {
    useToastStore.setState({
      toasts: [
        { id: "1", message: "Oldest", type: "info" },
        { id: "2", message: "Middle", type: "info" },
        { id: "3", message: "Recent 1", type: "info" },
        { id: "4", message: "Recent 2", type: "info" },
        { id: "5", message: "Newest", type: "info" },
      ],
    });

    render(<ToastContainer />);
    expect(screen.queryByText("Oldest")).not.toBeInTheDocument();
    expect(screen.queryByText("Middle")).not.toBeInTheDocument();
    expect(screen.getByText("Recent 1")).toBeInTheDocument();
    expect(screen.getByText("Recent 2")).toBeInTheDocument();
    expect(screen.getByText("Newest")).toBeInTheDocument();
  });

  it("shows all toasts when under the limit", () => {
    useToastStore.setState({
      toasts: [
        { id: "1", message: "First", type: "success" },
        { id: "2", message: "Second", type: "error" },
      ],
    });

    render(<ToastContainer />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
