/**
 * Core user journey E2E tests — hit the REAL backend (no mocked API routes).
 *
 * Tests:
 * 1. Load app, authenticate via dev-login, verify main UI renders
 * 2. Paste a dataset URL → dataset loads → schema appears
 * 3. Conversation CRUD via API (create, rename, pin/unpin, delete)
 * 4. Export via API (CSV, conversation JSON, conversation HTML)
 *
 * NOTE: Chat/LLM tests require a real Gemini API key and are skipped
 * when running against a test backend with a dummy key.
 */

import { test, expect, type Page } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:5173";

// A small, publicly accessible parquet file for testing
const TEST_DATASET_URL =
  "https://huggingface.co/datasets/scikit-learn/iris/resolve/main/Iris.parquet";

/**
 * Authenticate via the dev-login endpoint and set the session cookie.
 * If the dev user doesn't exist yet, seeds a referral key first.
 */
async function devLogin(page: Page): Promise<void> {
  // Try dev-login — if user already exists, no referral key needed
  const resp = await page.request.post(`${BACKEND_URL}/auth/dev-login`, {
    data: { referral_key: "e2e-test-key" },
  });

  if (resp.ok()) {
    // Extract session cookie from response Set-Cookie header
    const cookies = resp.headers()["set-cookie"];
    if (cookies) {
      const match = cookies.match(/session_token=([^;]+)/);
      if (match) {
        await page.context().addCookies([
          {
            name: "session_token",
            value: match[1],
            domain: "localhost",
            path: "/",
          },
        ]);
        return;
      }
    }
  }

  // If dev-login failed (no referral key / no user), try to create one
  // by seeding a referral key via the DB. This requires the backend
  // to already have the dev user seeded OR a valid referral key.
  throw new Error(
    `Dev login failed: ${resp.status()} ${await resp.text()}. ` +
      "Ensure backend is running with a dev user or valid referral key."
  );
}

/**
 * Helper: wait for the app to fully load after navigation.
 */
async function waitForAppReady(page: Page): Promise<void> {
  await page.goto(FRONTEND_URL);
  await page.waitForLoadState("networkidle");
  // Wait for the main UI container
  await expect(page.locator("#root")).toBeAttached({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Test: Authentication and app loading
// ---------------------------------------------------------------------------

test.describe("Core Journey: Auth & App Load", () => {
  test("app loads and shows login or main UI", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveTitle("ChatDF");
    await expect(page.locator("#root")).toBeAttached();
  });

  test("dev-login authenticates and shows main UI", async ({ page }) => {
    await devLogin(page);
    await waitForAppReady(page);

    // After auth, we should see the chat area (not the login page)
    // Look for the chat input or new chat button
    const chatInput = page.locator(
      'textarea[placeholder*="question"], textarea[placeholder*="Ask"], input[placeholder*="question"]'
    );
    const newChatBtn = page.getByRole("button", { name: /new chat/i });

    // Either the chat input or new chat button should be visible
    const isAuthenticated =
      (await chatInput.isVisible().catch(() => false)) ||
      (await newChatBtn.isVisible().catch(() => false));

    expect(isAuthenticated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: Dataset loading
// ---------------------------------------------------------------------------

test.describe("Core Journey: Dataset Loading", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
    await waitForAppReady(page);
  });

  test("paste dataset URL → dataset loads with schema", async ({ page }) => {
    // Find the dataset URL input
    const urlInput = page.locator(
      'input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="dataset"], input[placeholder*="paste"]'
    );

    // If right panel is collapsed, open it
    const datasetToggle = page.getByRole("button", {
      name: /dataset|data|right/i,
    });
    if (await datasetToggle.isVisible().catch(() => false)) {
      await datasetToggle.click();
      await page.waitForTimeout(500);
    }

    await expect(urlInput.first()).toBeVisible({ timeout: 5_000 });
    await urlInput.first().fill(TEST_DATASET_URL);

    // Submit the URL (press Enter or click submit button)
    await urlInput.first().press("Enter");

    // Wait for the dataset to load — look for schema columns or dataset card
    // The dataset card should appear with the name and column info
    const datasetCard = page.locator('[data-testid="dataset-card"]').first();
    const schemaInfo = page.locator("text=/sepal|petal|species/i").first();

    // Wait for either the dataset card or schema info to appear
    await expect(
      datasetCard.or(schemaInfo)
    ).toBeVisible({ timeout: 30_000 });
  });
});

// ---------------------------------------------------------------------------
// Test: Conversation CRUD (API-driven for reliability)
// ---------------------------------------------------------------------------

test.describe("Core Journey: Conversation Management", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test("create a new conversation via API", async ({ page }) => {
    const resp = await page.request.post(`${BACKEND_URL}/conversations`);
    expect(resp.ok()).toBe(true);
    expect(resp.status()).toBe(201);

    const conv = await resp.json();
    expect(conv.id).toBeTruthy();
    expect(typeof conv.id).toBe("string");
    expect(conv.created_at).toBeTruthy();

    // Verify the conversation appears in the list
    const listResp = await page.request.get(`${BACKEND_URL}/conversations`);
    expect(listResp.ok()).toBe(true);
    const list = await listResp.json();
    const found = list.conversations.some(
      (c: { id: string }) => c.id === conv.id
    );
    expect(found).toBe(true);

    // Clean up
    await page.request.delete(`${BACKEND_URL}/conversations/${conv.id}`);
  });

  test("rename a conversation via API", async ({ page }) => {
    // Create a conversation to rename
    const createResp = await page.request.post(
      `${BACKEND_URL}/conversations`
    );
    expect(createResp.ok()).toBe(true);
    const conv = await createResp.json();

    // Rename it
    const renameResp = await page.request.patch(
      `${BACKEND_URL}/conversations/${conv.id}`,
      { data: { title: "E2E Renamed Conversation" } }
    );
    expect(renameResp.ok()).toBe(true);
    const renamed = await renameResp.json();
    expect(renamed.title).toBe("E2E Renamed Conversation");
    expect(renamed.id).toBe(conv.id);

    // Verify the rename persisted by fetching the detail
    const detailResp = await page.request.get(
      `${BACKEND_URL}/conversations/${conv.id}`
    );
    expect(detailResp.ok()).toBe(true);
    const detail = await detailResp.json();
    expect(detail.title).toBe("E2E Renamed Conversation");

    // Clean up
    await page.request.delete(`${BACKEND_URL}/conversations/${conv.id}`);
  });

  test("pin and unpin a conversation via API", async ({ page }) => {
    // Create a conversation to pin
    const createResp = await page.request.post(
      `${BACKEND_URL}/conversations`
    );
    expect(createResp.ok()).toBe(true);
    const conv = await createResp.json();

    // Pin it
    const pinResp = await page.request.patch(
      `${BACKEND_URL}/conversations/${conv.id}/pin`,
      { data: { is_pinned: true } }
    );
    expect(pinResp.ok()).toBe(true);
    const pinned = await pinResp.json();
    expect(pinned.is_pinned).toBe(true);
    expect(pinned.id).toBe(conv.id);

    // Verify pinned status in the conversation list
    const listResp = await page.request.get(`${BACKEND_URL}/conversations`);
    expect(listResp.ok()).toBe(true);
    const list = await listResp.json();
    const pinnedConv = list.conversations.find(
      (c: { id: string }) => c.id === conv.id
    );
    expect(pinnedConv).toBeTruthy();
    expect(pinnedConv.is_pinned).toBe(true);

    // Unpin it
    const unpinResp = await page.request.patch(
      `${BACKEND_URL}/conversations/${conv.id}/pin`,
      { data: { is_pinned: false } }
    );
    expect(unpinResp.ok()).toBe(true);
    const unpinned = await unpinResp.json();
    expect(unpinned.is_pinned).toBe(false);

    // Clean up
    await page.request.delete(`${BACKEND_URL}/conversations/${conv.id}`);
  });

  test("delete a conversation via API", async ({ page }) => {
    // Create a conversation to delete
    const createResp = await page.request.post(
      `${BACKEND_URL}/conversations`
    );
    expect(createResp.ok()).toBe(true);
    const conv = await createResp.json();

    // Verify it exists
    const detailResp = await page.request.get(
      `${BACKEND_URL}/conversations/${conv.id}`
    );
    expect(detailResp.ok()).toBe(true);

    // Delete it
    const deleteResp = await page.request.delete(
      `${BACKEND_URL}/conversations/${conv.id}`
    );
    expect(deleteResp.ok()).toBe(true);
    const deleted = await deleteResp.json();
    expect(deleted.success).toBe(true);

    // Verify it is gone (should return 403 or 404)
    const goneResp = await page.request.get(
      `${BACKEND_URL}/conversations/${conv.id}`
    );
    expect(goneResp.ok()).toBe(false);
    expect([403, 404]).toContain(goneResp.status());
  });
});

// ---------------------------------------------------------------------------
// Test: Export (API-driven)
// ---------------------------------------------------------------------------

test.describe("Core Journey: Export", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test("CSV export endpoint produces a valid CSV file", async ({ page }) => {
    // POST to /export/csv with sample data
    const csvResp = await page.request.post(`${BACKEND_URL}/export/csv`, {
      data: {
        columns: ["id", "name", "value"],
        rows: [
          [1, "alpha", 10.5],
          [2, "beta", 20.3],
          [3, "gamma", 30.1],
        ],
        filename: "e2e-test-export",
      },
    });
    expect(csvResp.ok()).toBe(true);

    // Verify response headers indicate a CSV download
    const contentType = csvResp.headers()["content-type"];
    expect(contentType).toContain("text/csv");
    const disposition = csvResp.headers()["content-disposition"];
    expect(disposition).toContain("e2e-test-export.csv");

    // Verify the CSV content is correct
    const body = await csvResp.text();
    const lines = body.trim().split("\n");
    expect(lines.length).toBe(4); // 1 header + 3 data rows
    expect(lines[0]).toContain("id");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("value");
    expect(lines[1]).toContain("alpha");
  });

  test("conversation JSON export endpoint works", async ({ page }) => {
    // Create a conversation to export
    const createResp = await page.request.post(
      `${BACKEND_URL}/conversations`
    );
    expect(createResp.ok()).toBe(true);
    const conv = await createResp.json();

    // Rename it so we can verify the title in the export
    await page.request.patch(
      `${BACKEND_URL}/conversations/${conv.id}`,
      { data: { title: "E2E Export Test" } }
    );

    // Export the conversation as JSON
    const exportResp = await page.request.get(
      `${BACKEND_URL}/conversations/${conv.id}/export`
    );
    expect(exportResp.ok()).toBe(true);

    const contentType = exportResp.headers()["content-type"];
    expect(contentType).toContain("application/json");
    const disposition = exportResp.headers()["content-disposition"];
    expect(disposition).toContain("conversation-");

    // Verify the exported JSON structure
    const exported = await exportResp.json();
    expect(exported.conversation).toBeTruthy();
    expect(exported.conversation.id).toBe(conv.id);
    expect(exported.conversation.title).toBe("E2E Export Test");
    expect(Array.isArray(exported.messages)).toBe(true);
    expect(Array.isArray(exported.datasets)).toBe(true);

    // Clean up
    await page.request.delete(`${BACKEND_URL}/conversations/${conv.id}`);
  });

  test("HTML export endpoint produces valid HTML", async ({ page }) => {
    // Create a conversation to export
    const createResp = await page.request.post(
      `${BACKEND_URL}/conversations`
    );
    expect(createResp.ok()).toBe(true);
    const conv = await createResp.json();

    await page.request.patch(
      `${BACKEND_URL}/conversations/${conv.id}`,
      { data: { title: "E2E HTML Export" } }
    );

    // Export as HTML
    const exportResp = await page.request.get(
      `${BACKEND_URL}/conversations/${conv.id}/export/html`
    );
    expect(exportResp.ok()).toBe(true);

    const contentType = exportResp.headers()["content-type"];
    expect(contentType).toContain("text/html");

    const htmlBody = await exportResp.text();
    expect(htmlBody).toContain("<!DOCTYPE html>");
    expect(htmlBody).toContain("E2E HTML Export");
    expect(htmlBody).toContain("ChatDF");

    // Clean up
    await page.request.delete(`${BACKEND_URL}/conversations/${conv.id}`);
  });
});
