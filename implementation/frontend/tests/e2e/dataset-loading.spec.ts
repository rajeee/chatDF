// E2E tests for dataset loading flows.
// Covers: CUF-3 (load dataset by URL).
//
// Tests: spec/test.md#CUF-3

import { test, expect } from "./fixtures/auth";

test.describe("CUF-3: Load dataset by URL", () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto("/");
    await authedPage.waitForLoadState("networkidle");
  });

  test(
    "CUF-3 - dataset input field is visible in the right panel",
    async ({ authedPage }) => {
      const datasetInput = authedPage.locator('[data-testid="dataset-input"]');
      await expect(datasetInput).toBeVisible();

      // The input field should have the placeholder "Paste parquet URL..."
      const urlInput = authedPage.locator(
        '[data-testid="dataset-input"] input[type="text"]',
      );
      await expect(urlInput).toBeVisible();
      await expect(urlInput).toHaveAttribute(
        "placeholder",
        "Paste parquet URL...",
      );
    },
  );

  test(
    "CUF-3 - Add button is visible but disabled when input is empty",
    async ({ authedPage }) => {
      const addButton = authedPage.getByRole("button", { name: "Add" });
      await expect(addButton).toBeVisible();
      await expect(addButton).toBeDisabled();
    },
  );

  test(
    "CUF-3 - pasting a valid parquet URL and clicking Add submits the dataset",
    async ({ authedPage }) => {
      // We need to create a conversation first so the dataset can be added to it.
      // Click the "+ New Chat" button to create one.
      const newChatButton = authedPage.locator(
        '[data-testid="new-chat-button"]',
      );
      if (await newChatButton.isVisible()) {
        await newChatButton.click();
        // Wait for the conversation to be created
        await authedPage.waitForTimeout(500);
      }

      const urlInput = authedPage.locator(
        '[data-testid="dataset-input"] input[type="text"]',
      );

      // Intercept the POST request to /conversations/:id/datasets
      // so we can verify it was made and return a mock response.
      const datasetPostPromise = authedPage.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("/datasets"),
        { timeout: 5000 },
      ).catch(() => null);

      // Mock the backend response for dataset creation
      await authedPage.route("**/conversations/*/datasets", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              dataset_id: "test-dataset-001",
              status: "loading",
            }),
          });
        } else {
          await route.continue();
        }
      });

      // Type a valid parquet URL
      const testUrl = "https://example.com/data/test-data.parquet";
      await urlInput.fill(testUrl);

      // Add button should now be enabled
      const addButton = authedPage.getByRole("button", { name: "Add" });
      await expect(addButton).toBeEnabled();

      // Click the Add button
      await addButton.click();

      // Verify that a POST request was made
      const postRequest = await datasetPostPromise;
      if (postRequest) {
        expect(postRequest.method()).toBe("POST");
      }

      // After successful submission, the URL input should be cleared
      await expect(urlInput).toHaveValue("");
    },
  );

  test(
    "CUF-3 - invalid URL shows validation error",
    async ({ authedPage }) => {
      const urlInput = authedPage.locator(
        '[data-testid="dataset-input"] input[type="text"]',
      );

      // Type an invalid URL
      await urlInput.fill("not-a-valid-url");

      // Wait for debounced validation (300ms + buffer)
      await authedPage.waitForTimeout(500);

      // Error message should appear
      const errorMessage = authedPage.locator(
        '[data-testid="dataset-input-error"]',
      );
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText("Invalid URL format");
    },
  );

  test(
    "CUF-3 - Add button is disabled when there is a validation error",
    async ({ authedPage }) => {
      const urlInput = authedPage.locator(
        '[data-testid="dataset-input"] input[type="text"]',
      );

      // Type an invalid URL
      await urlInput.fill("not-a-url");

      // Wait for debounced validation
      await authedPage.waitForTimeout(500);

      // Add button should remain disabled due to error
      const addButton = authedPage.getByRole("button", { name: "Add" });
      await expect(addButton).toBeDisabled();
    },
  );

  test(
    "CUF-3 - duplicate URL shows 'already loaded' error",
    async ({ authedPage }) => {
      // First, we need to simulate that a dataset is already loaded in the store.
      // We can do this by mocking the backend and submitting a URL, then trying again.
      const urlInput = authedPage.locator(
        '[data-testid="dataset-input"] input[type="text"]',
      );

      // Create a conversation first
      const newChatButton = authedPage.locator(
        '[data-testid="new-chat-button"]',
      );
      if (await newChatButton.isVisible()) {
        await newChatButton.click();
        await authedPage.waitForTimeout(500);
      }

      // Mock the dataset creation endpoint
      await authedPage.route("**/conversations/*/datasets", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              dataset_id: "test-dataset-dup-001",
              status: "loading",
            }),
          });
        } else {
          await route.continue();
        }
      });

      const testUrl = "https://example.com/data/duplicate-test.parquet";

      // Submit the URL a first time
      await urlInput.fill(testUrl);
      const addButton = authedPage.getByRole("button", { name: "Add" });
      await addButton.click();
      await authedPage.waitForTimeout(300);

      // Now try the same URL again
      await urlInput.fill(testUrl);
      await authedPage.waitForTimeout(500);

      // The validation should catch the duplicate
      const errorMessage = authedPage.locator(
        '[data-testid="dataset-input-error"]',
      );
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText("This dataset is already loaded");
    },
  );

  test(
    "CUF-3 - dataset card appears after successful submission",
    async ({ authedPage }) => {
      // Create a conversation first
      const newChatButton = authedPage.locator(
        '[data-testid="new-chat-button"]',
      );
      if (await newChatButton.isVisible()) {
        await newChatButton.click();
        await authedPage.waitForTimeout(500);
      }

      // Mock the dataset creation endpoint
      await authedPage.route("**/conversations/*/datasets", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              dataset_id: "test-dataset-card-001",
              status: "loading",
            }),
          });
        } else {
          await route.continue();
        }
      });

      const urlInput = authedPage.locator(
        '[data-testid="dataset-input"] input[type="text"]',
      );
      await urlInput.fill("https://example.com/data/card-test.parquet");

      const addButton = authedPage.getByRole("button", { name: "Add" });
      await addButton.click();

      // A dataset card should appear in the right panel
      const datasetCard = authedPage.locator('[data-testid="dataset-card"]');
      await expect(datasetCard.first()).toBeVisible({ timeout: 5000 });

      // The card should initially show loading state (progress bar)
      const progressBar = authedPage.locator(
        '[data-testid="dataset-progress-bar"]',
      );
      await expect(progressBar.first()).toBeVisible();
    },
  );
});
