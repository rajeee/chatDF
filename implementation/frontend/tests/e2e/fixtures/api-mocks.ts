// Implements: spec/test_plan.md#e2e-test-data
//
// Gemini API mock using Playwright's page.route() to intercept outbound
// requests from the backend to the Gemini API. Returns canned streaming
// responses with predictable tool calls.
//
// Usage:
//   import { mockGeminiApi, CANNED_RESPONSES } from "../fixtures/api-mocks";
//   test("chat flow", async ({ page }) => {
//     await mockGeminiApi(page);
//     // ... interact with the app
//   });

import type { Page, Route } from "@playwright/test";

/** Canned response shapes for different test scenarios. */
export const CANNED_RESPONSES = {
  /** Simple text-only response (no SQL tool call). */
  textOnly: {
    text: "Based on the data, there are 10 rows in the dataset.",
    tokenCount: { input: 150, output: 30 },
  },

  /** Response with a SQL tool call. */
  withSqlQuery: {
    text: "Here are the results of your query. The average value is 42.5.",
    sqlQuery: "SELECT AVG(value) AS avg_value FROM test_data",
    tokenCount: { input: 200, output: 50 },
  },

  /** Response for schema exploration. */
  schemaExploration: {
    text: "The dataset has 3 columns: id (integer), name (text), and value (real).",
    sqlQuery: "SELECT * FROM test_data LIMIT 5",
    tokenCount: { input: 180, output: 40 },
  },

  /** Error response (simulates LLM error). */
  error: {
    error: "Model temporarily unavailable",
  },
} as const;

/**
 * Build a Server-Sent Events (SSE) streaming response body
 * that mimics the Gemini streaming format.
 */
function buildStreamingResponse(scenario: keyof typeof CANNED_RESPONSES): string {
  const response = CANNED_RESPONSES[scenario];

  if ("error" in response) {
    return JSON.stringify({
      error: { message: response.error, code: 503 },
    });
  }

  // Build a Gemini-style streaming response
  const parts: any[] = [];

  // If there's a SQL query, add a function call part first
  if ("sqlQuery" in response && response.sqlQuery) {
    parts.push({
      functionCall: {
        name: "execute_sql",
        args: { query: response.sqlQuery },
      },
    });
  }

  // Add the text part
  parts.push({ text: response.text });

  return JSON.stringify({
    candidates: [
      {
        content: {
          parts,
          role: "model",
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: response.tokenCount.input,
      candidatesTokenCount: response.tokenCount.output,
      totalTokenCount:
        response.tokenCount.input + response.tokenCount.output,
    },
  });
}

/**
 * Intercept Gemini API calls at the network level using page.route().
 *
 * By default, returns the "withSqlQuery" canned response.
 * Pass a `scenario` parameter to choose a different response.
 */
export async function mockGeminiApi(
  page: Page,
  scenario: keyof typeof CANNED_RESPONSES = "withSqlQuery",
): Promise<void> {
  // Intercept any request to the Gemini API (generativelanguage.googleapis.com)
  await page.route(
    "**/generativelanguage.googleapis.com/**",
    async (route: Route) => {
      const body = buildStreamingResponse(scenario);

      if ("error" in CANNED_RESPONSES[scenario]) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body,
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body,
        });
      }
    },
  );
}

/**
 * Clear all Gemini API mocks from the page.
 */
export async function clearGeminiMock(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: "ignoreErrors" });
}
