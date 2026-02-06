// E2E tests for authentication flows.
// Covers: CUF-1 (first-time sign-up), CUF-2 (returning user sign-in), CUF-6 (logout).
//
// Tests: spec/test.md#CUF-1, spec/test.md#CUF-2, spec/test.md#CUF-6

import { test as base, expect } from "@playwright/test";
import { test as authedTest, expect as authedExpect } from "./fixtures/auth";

// ---------------------------------------------------------------------------
// CUF-1: First-time sign-up flow
// ---------------------------------------------------------------------------
base.describe("CUF-1: First-time sign-up with referral key", () => {
  base(
    "CUF-1 - unauthenticated user visiting / is redirected to /sign-in",
    async ({ page }) => {
      await page.goto("/");
      // ProtectedRoute calls GET /auth/me, receives 401, and redirects to /sign-in
      await page.waitForURL("**/sign-in");
      expect(page.url()).toContain("/sign-in");
    },
  );

  base(
    "CUF-1 - sign-in page has 'Sign in with Google' button",
    async ({ page }) => {
      await page.goto("/sign-in");
      const signInButton = page.getByRole("button", {
        name: "Sign in with Google",
      });
      await expect(signInButton).toBeVisible();
    },
  );

  base(
    "CUF-1 - sign-in page has referral key input",
    async ({ page }) => {
      await page.goto("/sign-in");
      const referralInput = page.getByPlaceholder("Enter referral key");
      await expect(referralInput).toBeVisible();
    },
  );

  base(
    "CUF-1 - sign-in page displays error from URL params",
    async ({ page }) => {
      await page.goto("/sign-in?error=Invalid+referral+key");
      const errorAlert = page.getByRole("alert");
      await expect(errorAlert).toBeVisible();
      await expect(errorAlert).toContainText("Invalid referral key");
    },
  );

  base(
    "CUF-1 - after seeding user+session and setting cookie, user lands on main app",
    async ({ page, request }) => {
      // Simulate what happens after a successful OAuth flow:
      // 1. Seed a user and session via the seeding server
      // 2. Set the session cookie
      // 3. Visit "/" and verify we see the main app shell (not /sign-in)

      let sessionToken: string;
      try {
        const response = await request.post("http://localhost:8001/seed/auth", {
          data: {
            user: {
              id: "e2e-signup-user-001",
              google_id: "google-signup-001",
              email: "signup@test.chatdf.dev",
              name: "Signup Test User",
              avatar_url: null,
            },
          },
        });
        if (!response.ok()) {
          base.skip(true, "Seeding server not available");
          return;
        }
        const body = await response.json();
        sessionToken = body.session_token;
      } catch {
        base.skip(true, "Seeding server not available");
        return;
      }

      // Set the session cookie so the app treats us as authenticated
      await page.context().addCookies([
        {
          name: "session_token",
          value: sessionToken,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      await page.goto("/");
      // Should NOT redirect to /sign-in -- should stay on the main app
      await page.waitForLoadState("networkidle");
      // Verify the app shell renders (data-testid="app-shell")
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// CUF-2: Returning user sign-in
// ---------------------------------------------------------------------------
authedTest.describe("CUF-2: Returning user sign-in", () => {
  authedTest(
    "CUF-2 - authenticated user lands on main app with app shell visible",
    async ({ authedPage }) => {
      await authedPage.goto("/");
      await authedPage.waitForLoadState("networkidle");
      await authedExpect(
        authedPage.locator('[data-testid="app-shell"]'),
      ).toBeVisible();
    },
  );

  authedTest(
    "CUF-2 - authenticated user sees left panel with conversation history area",
    async ({ authedPage }) => {
      await authedPage.goto("/");
      await authedPage.waitForLoadState("networkidle");

      // The left panel should render. It contains the chat history and new-chat button.
      const newChatButton = authedPage.locator(
        '[data-testid="new-chat-button"]',
      );
      await authedExpect(newChatButton).toBeVisible();
    },
  );

  authedTest(
    "CUF-2 - authenticated user is not redirected to /sign-in",
    async ({ authedPage }) => {
      await authedPage.goto("/");
      await authedPage.waitForLoadState("networkidle");
      // URL should remain "/" and not redirect to /sign-in
      expect(authedPage.url()).not.toContain("/sign-in");
    },
  );
});

// ---------------------------------------------------------------------------
// CUF-6: Logout
// ---------------------------------------------------------------------------
authedTest.describe("CUF-6: Logout", () => {
  authedTest(
    "CUF-6 - clicking sign-out redirects to /sign-in",
    async ({ authedPage }) => {
      await authedPage.goto("/");
      await authedPage.waitForLoadState("networkidle");

      // The Account component renders a "Sign out" button with data-testid="sign-out-button"
      const signOutButton = authedPage.locator(
        '[data-testid="sign-out-button"]',
      );

      // The sign-out button may be in the left panel which could be collapsed.
      // Toggle the left panel open if needed.
      if (!(await signOutButton.isVisible())) {
        const toggleButton = authedPage.locator(
          '[data-testid="toggle-left-panel"]',
        );
        if (await toggleButton.isVisible()) {
          await toggleButton.click();
        }
      }

      await authedExpect(signOutButton).toBeVisible({ timeout: 5000 });
      await signOutButton.click();

      // After logout, should redirect to /sign-in
      await authedPage.waitForURL("**/sign-in", { timeout: 10000 });
      expect(authedPage.url()).toContain("/sign-in");
    },
  );

  authedTest(
    "CUF-6 - after logout, visiting / redirects to /sign-in again",
    async ({ authedPage }) => {
      await authedPage.goto("/");
      await authedPage.waitForLoadState("networkidle");

      // Sign out
      const signOutButton = authedPage.locator(
        '[data-testid="sign-out-button"]',
      );
      if (!(await signOutButton.isVisible())) {
        const toggleButton = authedPage.locator(
          '[data-testid="toggle-left-panel"]',
        );
        if (await toggleButton.isVisible()) {
          await toggleButton.click();
        }
      }

      await authedExpect(signOutButton).toBeVisible({ timeout: 5000 });
      await signOutButton.click();
      await authedPage.waitForURL("**/sign-in", { timeout: 10000 });

      // Now try visiting "/" again -- should redirect back to /sign-in
      await authedPage.goto("/");
      await authedPage.waitForURL("**/sign-in", { timeout: 10000 });
      expect(authedPage.url()).toContain("/sign-in");
    },
  );
});
