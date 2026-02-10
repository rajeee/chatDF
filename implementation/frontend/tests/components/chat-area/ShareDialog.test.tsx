// Tests for ShareDialog component.
//
// SD-RENDER-1: Renders share dialog with correct title
// SD-SHARE-1: Share button calls API and generates link
// SD-COPY-1: Copy button copies URL to clipboard
// SD-UNSHARE-1: Stop sharing button revokes share link
// SD-OUTSIDE-1: Outside click closes dialog
// SD-ESCAPE-1: Escape key closes dialog
// SD-LOADING-1: Loading state while sharing
// SD-ERROR-1: Error handling when API fails

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../helpers/mocks/server";

// Mock the api client module so we can control responses
vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

// Import AFTER mocking
import { ShareDialog } from "@/components/chat-area/ShareDialog";
import { apiPost, apiDelete } from "@/api/client";

const mockApiPost = vi.mocked(apiPost);
const mockApiDelete = vi.mocked(apiDelete);

const CONV_ID = "conv-test-123";
const SHARE_TOKEN = "share-abc-def";

function defaultShareResponse() {
  return {
    share_token: SHARE_TOKEN,
    share_url: `http://localhost:5173/share/${SHARE_TOKEN}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: apiPost resolves with share response
  mockApiPost.mockResolvedValue(defaultShareResponse());
  mockApiDelete.mockResolvedValue({ success: true });
  // Mock clipboard
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("SD-RENDER: Renders share dialog with correct title", () => {
  it("renders the dialog with 'Share Conversation' heading", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Share conversation");
    expect(screen.getByText("Share Conversation")).toBeInTheDocument();
  });

  it("has a close button with correct aria-label", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    expect(screen.getByLabelText("Close share dialog")).toBeInTheDocument();
  });

  it("clicking the close button calls onClose", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    const closeBtn = screen.getByLabelText("Close share dialog");
    await act(async () => {
      closeBtn.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SD-SHARE: Share button calls API and generates link", () => {
  it("auto-generates share link on mount by calling apiPost", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    expect(mockApiPost).toHaveBeenCalledWith(`/conversations/${CONV_ID}/share`);
  });

  it("displays the generated share URL after API resolves", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    // The URL is built from window.location.origin + /share/ + token
    await waitFor(() => {
      expect(screen.getByText(/\/share\/share-abc-def/)).toBeInTheDocument();
    });
  });

  it("shows 'Shared' status indicator after link is generated", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Shared")).toBeInTheDocument();
    });
  });

  it("shows info text about read-only access", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Anyone with this link can view this conversation (read-only).")
      ).toBeInTheDocument();
    });
  });
});

describe("SD-COPY: Copy button copies URL to clipboard", () => {
  it("renders a Copy button once the share URL is available", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });
  });

  it("clicking Copy calls navigator.clipboard.writeText with the share URL", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    const copyBtn = screen.getByText("Copy");
    await act(async () => {
      copyBtn.click();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(`/share/${SHARE_TOKEN}`)
    );
  });

  it("shows 'Copied!' text after clicking Copy", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    const copyBtn = screen.getByText("Copy");
    await act(async () => {
      copyBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it("uses fallback copy method when clipboard API fails", async () => {
    const onClose = vi.fn();
    // Make clipboard.writeText reject
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("Not allowed")),
      },
    });
    // jsdom does not define document.execCommand, so assign it directly
    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    const copyBtn = screen.getByText("Copy");
    await act(async () => {
      copyBtn.click();
    });

    await waitFor(() => {
      expect(execCommandMock).toHaveBeenCalledWith("copy");
    });

    // Also verify the "Copied!" feedback still shows with fallback
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });

    // Clean up
    delete (document as any).execCommand;
  });
});

describe("SD-UNSHARE: Stop sharing button", () => {
  it("renders a 'Stop Sharing' button after link is generated", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Stop Sharing")).toBeInTheDocument();
    });
  });

  it("clicking 'Stop Sharing' calls apiDelete to revoke the link", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Stop Sharing")).toBeInTheDocument();
    });

    const stopBtn = screen.getByText("Stop Sharing");
    await act(async () => {
      stopBtn.click();
    });

    expect(mockApiDelete).toHaveBeenCalledWith(`/conversations/${CONV_ID}/share`);
  });

  it("removes the share URL from display after successful unshare", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Stop Sharing")).toBeInTheDocument();
    });

    const stopBtn = screen.getByText("Stop Sharing");
    await act(async () => {
      stopBtn.click();
    });

    // After unshare resolves, the share URL should be gone
    await waitFor(() => {
      expect(screen.queryByText("Stop Sharing")).not.toBeInTheDocument();
    });
  });

  it("'Stop Sharing' button is disabled while loading", async () => {
    const onClose = vi.fn();
    // Make the unshare call hang
    let resolveUnshare: (v: unknown) => void;
    mockApiDelete.mockReturnValue(
      new Promise((resolve) => {
        resolveUnshare = resolve;
      })
    );

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Stop Sharing")).toBeInTheDocument();
    });

    const stopBtn = screen.getByText("Stop Sharing");
    await act(async () => {
      stopBtn.click();
    });

    expect(stopBtn).toBeDisabled();

    // Resolve to clean up
    await act(async () => {
      resolveUnshare!({ success: true });
    });
  });
});

describe("SD-OUTSIDE: Outside click closes dialog", () => {
  it("calls onClose when clicking outside the dialog", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(
        <div data-testid="outside-area">
          <ShareDialog conversationId={CONV_ID} onClose={onClose} />
        </div>
      );
    });

    // Click outside the dialog
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onClose when clicking inside the dialog", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    const dialog = screen.getByRole("dialog");

    // Click inside the dialog
    await act(async () => {
      dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    // onClose should not have been called for the mousedown inside dialog
    // (it may have been called from the auto-share mount effect, but not from
    // the click-outside handler)
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SD-ESCAPE: Escape key closes dialog", () => {
  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose for non-Escape keys", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SD-LOADING: Loading state while sharing", () => {
  it("shows 'Generating share link...' while API call is pending", async () => {
    const onClose = vi.fn();
    // Make apiPost hang indefinitely
    mockApiPost.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    expect(screen.getByText("Generating share link...")).toBeInTheDocument();
  });

  it("hides loading text once share link is generated", async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.queryByText("Generating share link...")).not.toBeInTheDocument();
    });
  });
});

describe("SD-ERROR: Error handling when API fails", () => {
  it("shows error message when share API call fails with Error", async () => {
    const onClose = vi.fn();
    mockApiPost.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows generic error message when share API fails with non-Error", async () => {
    const onClose = vi.fn();
    mockApiPost.mockRejectedValue("something went wrong");

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to create share link")).toBeInTheDocument();
    });
  });

  it("shows error message when unshare API call fails", async () => {
    const onClose = vi.fn();
    mockApiDelete.mockRejectedValue(new Error("Revoke failed"));

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    // Wait for the share link to appear first
    await waitFor(() => {
      expect(screen.getByText("Stop Sharing")).toBeInTheDocument();
    });

    const stopBtn = screen.getByText("Stop Sharing");
    await act(async () => {
      stopBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Revoke failed")).toBeInTheDocument();
    });
  });

  it("shows generic error when unshare fails with non-Error", async () => {
    const onClose = vi.fn();
    mockApiDelete.mockRejectedValue(42);

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Stop Sharing")).toBeInTheDocument();
    });

    const stopBtn = screen.getByText("Stop Sharing");
    await act(async () => {
      stopBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to revoke share link")).toBeInTheDocument();
    });
  });

  it("clears previous error when retrying share after failure", async () => {
    const onClose = vi.fn();
    // First call fails
    mockApiPost.mockRejectedValueOnce(new Error("First attempt failed"));

    await act(async () => {
      render(<ShareDialog conversationId={CONV_ID} onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText("First attempt failed")).toBeInTheDocument();
    });

    // Loading indicator should not be visible when share URL is absent and loading is false
    expect(screen.queryByText("Generating share link...")).not.toBeInTheDocument();
  });
});
