// Implements: spec/test_plan.md#e2e-test-data
//
// Auth fixture: seeds a user + session directly in the backend SQLite DB
// via the REST API, then returns a browser context with the session cookie.

import { test as base, type BrowserContext, type Page } from "@playwright/test";

/** Test user that gets seeded for every E2E test. */
export const TEST_USER = {
  id: "e2e-test-user-001",
  google_id: "google-e2e-001",
  email: "e2e@test.chatdf.dev",
  name: "E2E Test User",
  avatar_url: null,
};

const BACKEND_URL = "http://localhost:8000";

/**
 * Seed a test user and session by calling internal helper endpoints,
 * or by directly inserting into the database via a seeding endpoint.
 *
 * For E2E tests we bypass Google OAuth by directly inserting into the DB.
 * The backend exposes no special seeding endpoint, so we use a helper
 * that communicates with SQLite through the backend's test mode.
 *
 * Approach: POST raw SQL via a lightweight seeding script that runs before
 * each test, or use the Playwright `request` fixture to call the auth API
 * with mocked OAuth. For simplicity, we seed via direct HTTP to a small
 * seeding server (see data.ts) that also handles DB seeding.
 */
async function seedUserAndSession(
  request: ReturnType<typeof base.extend>["request"] extends infer R
    ? Awaited<R>
    : never,
): Promise<string> {
  // Seed user + session via the seeding server (runs alongside the backend)
  const response = await request.post(
    "http://localhost:8001/seed/auth",
    {
      data: {
        user: TEST_USER,
      },
    },
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to seed auth: ${response.status()} ${await response.text()}`,
    );
  }

  const body = await response.json();
  return body.session_token as string;
}

/**
 * Extended Playwright test fixture providing an authenticated page.
 *
 * Usage:
 *   import { test } from "../fixtures/auth";
 *   test("my test", async ({ authedPage }) => { ... });
 */
export const test = base.extend<{
  authedPage: Page;
  authedContext: BrowserContext;
  sessionToken: string;
}>({
  sessionToken: async ({ request }, use) => {
    const token = await seedUserAndSession(request as any);
    await use(token);
  },

  authedContext: async ({ browser, sessionToken }, use) => {
    const context = await browser.newContext();
    // Set the session cookie so all requests are authenticated
    await context.addCookies([
      {
        name: "session_token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await use(context);
    await context.close();
  },

  authedPage: async ({ authedContext }, use) => {
    const page = await authedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from "@playwright/test";
