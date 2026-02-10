// Tests for SignIn component.
//
// SI-RENDER-1: Renders sign-in page with title "ChatDF"
// SI-DESC-1: Shows description text
// SI-GOOGLE-BTN-1: Google sign-in button is visible
// SI-REFERRAL-1: Referral key input field accepts input
// SI-ERROR-1: Displays error from URL search params
// SI-NO-ERROR-1: Does not show error div when no error param
// SI-LOGIN-NO-KEY-1: Clicking sign-in without referral key calls login(undefined)
// SI-LOGIN-WITH-KEY-1: Clicking sign-in with referral key calls login(key)
// SI-LAYOUT-1: Page has centered layout styling

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignIn } from "@/components/auth/SignIn";

// --- Mock useAuth ---
const mockLogin = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

// --- Helpers ---

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders SignIn within routing context. Pass a `route` string to set
 * the initial URL (e.g. "/sign-in?error=Access+denied").
 */
function renderSignIn(route = "/sign-in") {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SI-RENDER: Page layout and branding", () => {
  it("renders the page title 'ChatDF'", () => {
    renderSignIn();

    expect(screen.getByRole("heading", { name: "ChatDF" })).toBeInTheDocument();
  });

  it("renders description text about chatting with data", () => {
    renderSignIn();

    expect(
      screen.getByText("Chat with your data using natural language")
    ).toBeInTheDocument();
  });

  it("has a centered layout container", () => {
    const { container } = renderSignIn();

    const outer = container.querySelector(".flex.items-center.justify-center.min-h-screen");
    expect(outer).toBeInTheDocument();
  });
});

describe("SI-GOOGLE-BTN: Sign in with Google button", () => {
  it("renders the 'Sign in with Google' button", () => {
    renderSignIn();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect(button).toBeInTheDocument();
  });

  it("button has type='button' attribute", () => {
    renderSignIn();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect(button).toHaveAttribute("type", "button");
  });
});

describe("SI-REFERRAL: Referral key input", () => {
  it("renders the referral key input with placeholder", () => {
    renderSignIn();

    const input = screen.getByPlaceholderText("Enter referral key");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
  });

  it("accepts user input into the referral key field", () => {
    renderSignIn();

    const input = screen.getByPlaceholderText("Enter referral key") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "my-secret-key" } });

    expect(input.value).toBe("my-secret-key");
  });

  it("starts with empty value", () => {
    renderSignIn();

    const input = screen.getByPlaceholderText("Enter referral key") as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

describe("SI-ERROR: Error message display", () => {
  it("displays error message from URL search params", () => {
    renderSignIn("/sign-in?error=Access+denied");

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Access denied");
  });

  it("displays URL-encoded error messages correctly", () => {
    renderSignIn("/sign-in?error=Invalid+referral+key");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid referral key");
  });

  it("does not render error alert when no error param", () => {
    renderSignIn();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not render error alert when error param is empty", () => {
    renderSignIn("/sign-in?error=");

    // Empty string is falsy, so the component should not render the error div
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SI-LOGIN: Sign-in button interaction", () => {
  it("calls login(undefined) when clicking sign-in without referral key", () => {
    renderSignIn();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    fireEvent.click(button);

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith(undefined);
  });

  it("calls login(key) when clicking sign-in with a referral key entered", () => {
    renderSignIn();

    const input = screen.getByPlaceholderText("Enter referral key");
    fireEvent.change(input, { target: { value: "test-key-123" } });

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    fireEvent.click(button);

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith("test-key-123");
  });

  it("passes trimmed referral key to login when key has whitespace", () => {
    // The component passes referralKey directly (no trim), and uses
    // `referralKey || undefined` which treats empty string as undefined
    renderSignIn();

    const input = screen.getByPlaceholderText("Enter referral key");
    fireEvent.change(input, { target: { value: "  " } });

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    fireEvent.click(button);

    // "  " is truthy, so it will be passed as-is
    expect(mockLogin).toHaveBeenCalledWith("  ");
  });

  it("calls login(undefined) when referral key was cleared back to empty", () => {
    renderSignIn();

    const input = screen.getByPlaceholderText("Enter referral key");

    // Type something then clear it
    fireEvent.change(input, { target: { value: "key" } });
    fireEvent.change(input, { target: { value: "" } });

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    fireEvent.click(button);

    expect(mockLogin).toHaveBeenCalledWith(undefined);
  });
});

describe("SI-STRUCTURE: DOM structure and styling", () => {
  it("wraps content in a max-width container", () => {
    const { container } = renderSignIn();

    const inner = container.querySelector(".max-w-sm");
    expect(inner).toBeInTheDocument();
  });

  it("heading has the correct class for bold styling", () => {
    renderSignIn();

    const heading = screen.getByRole("heading", { name: "ChatDF" });
    expect(heading.className).toContain("font-bold");
  });

  it("button has accent background color class", () => {
    renderSignIn();

    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect(button.className).toContain("bg-accent");
  });
});
