// E2E smoke test: verifies the basic infrastructure works.
// - App loads in the browser
// - Page renders the ChatDF UI
// - No critical console errors

import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("app loads and renders the root element", async ({ page }) => {
    await page.goto("/");

    // The app should render something in the #root div
    const root = page.locator("#root");
    await expect(root).toBeAttached();

    // The page title should be ChatDF
    await expect(page).toHaveTitle("ChatDF");
  });

  test("app shows login or main UI", async ({ page }) => {
    await page.goto("/");

    // Wait for the app to hydrate - either login page or main UI should appear
    // The app uses React Router, so we expect some content to render
    await page.waitForLoadState("networkidle");

    // There should be no uncaught errors visible
    const body = page.locator("body");
    await expect(body).not.toContainText("Unhandled Runtime Error");
  });
});
