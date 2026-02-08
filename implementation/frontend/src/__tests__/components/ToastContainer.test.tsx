import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastContainer } from "@/components/common/ToastContainer";
import { useToastStore } from "@/stores/toastStore";

describe("ToastContainer", () => {
  beforeEach(() => {
    // Reset store state before each test
    useToastStore.setState({ toasts: [] });
  });

  it("should render nothing when no toasts", () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it("should render a success toast", () => {
    const { success } = useToastStore.getState();
    success("Success message");

    render(<ToastContainer />);

    expect(screen.getByTestId("toast-container")).toBeInTheDocument();
    expect(screen.getByTestId("toast-success")).toBeInTheDocument();
    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("should render an error toast", () => {
    const { error } = useToastStore.getState();
    error("Error message");

    render(<ToastContainer />);

    expect(screen.getByTestId("toast-container")).toBeInTheDocument();
    expect(screen.getByTestId("toast-error")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should render an info toast", () => {
    const { info } = useToastStore.getState();
    info("Info message");

    render(<ToastContainer />);

    expect(screen.getByTestId("toast-container")).toBeInTheDocument();
    expect(screen.getByTestId("toast-info")).toBeInTheDocument();
    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("should render multiple toasts", () => {
    const { success, error, info } = useToastStore.getState();
    success("Success 1");
    error("Error 1");
    info("Info 1");

    render(<ToastContainer />);

    expect(screen.getByText("Success 1")).toBeInTheDocument();
    expect(screen.getByText("Error 1")).toBeInTheDocument();
    expect(screen.getByText("Info 1")).toBeInTheDocument();
  });

  it("should remove toast when close button is clicked", async () => {
    const user = userEvent.setup();
    const { success } = useToastStore.getState();
    success("Click to close");

    render(<ToastContainer />);

    const toast = screen.getByTestId("toast-success");
    expect(toast).toBeInTheDocument();

    const closeButton = screen.getByLabelText("Close");
    await user.click(closeButton);

    // Toast should be removed from store
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(0);
  });

  it("should have correct classes for animation", () => {
    const { success } = useToastStore.getState();
    success("Animated toast");

    render(<ToastContainer />);

    const toast = screen.getByTestId("toast-success");
    expect(toast.className).toContain("animate-toast-in");
  });

  it("should display toast container in fixed bottom-right position", () => {
    const { success } = useToastStore.getState();
    success("Positioned toast");

    render(<ToastContainer />);

    const container = screen.getByTestId("toast-container");
    expect(container.className).toContain("fixed");
    expect(container.className).toContain("bottom-4");
    expect(container.className).toContain("right-4");
  });
});
