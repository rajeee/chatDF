// Tests: spec/frontend/left_panel/test_plan.md#account-tests
// Verifies: spec/frontend/left_panel/account/plan.md
//
// AC-1: Displays user info (avatar, name, email)
// AC-2: Sign-out button calls logout
// AC-3: Loading state

import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { createUser } from "../../helpers/mocks/data";
import { Account } from "@/components/left-panel/Account";

beforeEach(() => {
  resetAllStores();
});

describe("AC-1: Displays user info", () => {
  it("renders user name and email", async () => {
    server.use(
      http.get("/auth/me", () => {
        return HttpResponse.json(
          createUser({ name: "Jane Doe", email: "jane@example.com" })
        );
      })
    );

    renderWithProviders(<Account />);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("renders avatar image when avatar_url is provided", async () => {
    server.use(
      http.get("/auth/me", () => {
        return HttpResponse.json(
          createUser({
            name: "Jane Doe",
            avatar_url: "https://example.com/avatar.jpg",
          })
        );
      })
    );

    renderWithProviders(<Account />);

    await waitFor(() => {
      const avatar = screen.getByTestId("user-avatar");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
    });
  });

  it("renders fallback avatar when avatar_url is null", async () => {
    server.use(
      http.get("/auth/me", () => {
        return HttpResponse.json(
          createUser({ name: "Jane Doe", avatar_url: null })
        );
      })
    );

    renderWithProviders(<Account />);

    await waitFor(() => {
      expect(screen.getByTestId("user-avatar-fallback")).toBeInTheDocument();
    });
  });
});

describe("AC-2: Sign-out button", () => {
  it("renders a sign-out button", async () => {
    renderWithProviders(<Account />);

    await waitFor(() => {
      expect(screen.getByTestId("sign-out-button")).toBeInTheDocument();
    });
  });

  it("clicking sign-out calls POST /auth/logout", async () => {
    let logoutCalled = false;

    server.use(
      http.post("/auth/logout", () => {
        logoutCalled = true;
        return HttpResponse.json({ success: true });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<Account />);

    await waitFor(() => {
      expect(screen.getByTestId("sign-out-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("sign-out-button"));

    await waitFor(() => {
      expect(logoutCalled).toBe(true);
    });
  });
});

describe("AC-3: Loading state", () => {
  it("shows nothing meaningful while user data is loading", () => {
    // Delay the auth response to keep loading state
    server.use(
      http.get("/auth/me", async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return HttpResponse.json(createUser());
      })
    );

    renderWithProviders(<Account />);

    // Should not crash, and should not show user info yet
    expect(screen.queryByText("Test User")).not.toBeInTheDocument();
  });
});
