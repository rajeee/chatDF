// Tests for ReasoningModal component.
//
// RM-CLOSED-1: Renders nothing when modal is closed
// RM-OPEN-1: Renders modal with reasoning content when open
// RM-TITLE-1: Displays "Reasoning" heading
// RM-CONTENT-1: Displays reasoning text via ReactMarkdown
// RM-CLOSE-BTN-1: Clicking close button calls closeReasoningModal
// RM-BACKDROP-1: Clicking backdrop overlay closes the modal
// RM-ESCAPE-1: Pressing Escape closes the modal
// RM-A11Y-1: Modal has role="dialog" and aria-modal="true"

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, act } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { ReasoningModal } from "@/components/chat-area/ReasoningModal";

// Mock react-markdown to render children as plain text
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

// Mock useFocusTrap to avoid side effects in tests
vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

beforeEach(() => {
  resetAllStores();
});

function openModal(reasoning: string) {
  useUiStore.setState({
    reasoningModalOpen: true,
    activeReasoning: reasoning,
  });
}

describe("RM-CLOSED: Modal not visible when closed", () => {
  it("renders nothing when reasoningModalOpen is false", () => {
    useUiStore.setState({ reasoningModalOpen: false, activeReasoning: "" });

    const { container } = renderWithProviders(<ReasoningModal />);

    expect(container.innerHTML).toBe("");
  });
});

describe("RM-OPEN: Modal visible when open", () => {
  it("renders the modal dialog when open with reasoning content", () => {
    openModal("The model analyzed the dataset columns.");

    renderWithProviders(<ReasoningModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("The model analyzed the dataset columns.")).toBeInTheDocument();
  });

  it("displays the 'Reasoning' heading", () => {
    openModal("Some reasoning text");

    renderWithProviders(<ReasoningModal />);

    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reasoning" })).toBeInTheDocument();
  });
});

describe("RM-CLOSE-BTN: Close button interaction", () => {
  it("calls closeReasoningModal when close button is clicked", () => {
    openModal("Test reasoning");

    renderWithProviders(<ReasoningModal />);

    const closeButton = screen.getByLabelText("Close");
    act(() => {
      closeButton.click();
    });

    // Modal should be closed in the store
    expect(useUiStore.getState().reasoningModalOpen).toBe(false);
  });
});

describe("RM-BACKDROP: Backdrop click interaction", () => {
  it("closes the modal when the backdrop overlay is clicked", () => {
    openModal("Test reasoning");

    renderWithProviders(<ReasoningModal />);

    const backdrop = screen.getByRole("dialog");
    // Click the backdrop itself (not the inner content panel)
    act(() => {
      backdrop.click();
    });

    expect(useUiStore.getState().reasoningModalOpen).toBe(false);
  });
});

describe("RM-ESCAPE: Escape key interaction", () => {
  it("closes the modal when Escape key is pressed", () => {
    openModal("Test reasoning");

    renderWithProviders(<ReasoningModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(useUiStore.getState().reasoningModalOpen).toBe(false);
  });
});

describe("RM-A11Y: Accessibility attributes", () => {
  it("modal has role=dialog and aria-modal=true", () => {
    openModal("Accessible reasoning");

    renderWithProviders(<ReasoningModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("heading is linked via aria-labelledby", () => {
    openModal("Accessible reasoning");

    renderWithProviders(<ReasoningModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "reasoning-modal-title");

    const heading = document.getElementById("reasoning-modal-title");
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe("Reasoning");
  });
});
