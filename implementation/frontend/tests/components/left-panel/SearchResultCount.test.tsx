// Tests: Search result count badge in ChatHistory
// Verifies the count badge appears when searching and disappears when cleared.

import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { createConversation } from "../../helpers/mocks/data";
import { ChatHistory } from "@/components/left-panel/ChatHistory";
import { fireEvent } from "@testing-library/react";

const conversations = [
  createConversation({ id: "conv-alpha", title: "Alpha project" }),
  createConversation({ id: "conv-beta", title: "Beta release" }),
  createConversation({ id: "conv-gamma", title: "Gamma testing" }),
  createConversation({ id: "conv-alpha2", title: "Alpha followup" }),
];

beforeEach(() => {
  resetAllStores();
  server.use(
    http.get("/conversations", () => {
      return HttpResponse.json({ conversations });
    })
  );
});

describe("Search result count badge", () => {
  it("does not show count badge when search is empty", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Alpha project")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("search-result-count")).not.toBeInTheDocument();
  });

  it("shows correct count when search matches multiple conversations", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Alpha project")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    await waitFor(() => {
      const badge = screen.getByTestId("search-result-count");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("2 results");
    });
  });

  it("shows singular 'result' when only one match", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Beta release")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    fireEvent.change(searchInput, { target: { value: "Beta" } });

    await waitFor(() => {
      const badge = screen.getByTestId("search-result-count");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("1 result");
    });
  });

  it("does not show count badge when search has no matches", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Alpha project")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    fireEvent.change(searchInput, { target: { value: "zzzznotfound" } });

    await waitFor(() => {
      expect(screen.getByText("No matches")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("search-result-count")).not.toBeInTheDocument();
  });

  it("disappears when search is cleared", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Alpha project")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");

    // Type a query to make badge appear
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    await waitFor(() => {
      expect(screen.getByTestId("search-result-count")).toBeInTheDocument();
    });

    // Clear the search
    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.queryByTestId("search-result-count")).not.toBeInTheDocument();
    });
  });

  it("updates count as search query changes", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Alpha project")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");

    // Search for "Alpha" - should match 2
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    await waitFor(() => {
      expect(screen.getByTestId("search-result-count").textContent).toBe("2 results");
    });

    // Narrow to "Alpha project" - should match 1
    fireEvent.change(searchInput, { target: { value: "Alpha project" } });

    await waitFor(() => {
      expect(screen.getByTestId("search-result-count").textContent).toBe("1 result");
    });
  });

  it("shows count matching all conversations when query matches all", async () => {
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Alpha project")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");

    // All conversation titles contain lowercase letters; search for common substring
    // "a" appears in Alpha (x2), Beta, Gamma - all 4 have "a" in their title
    fireEvent.change(searchInput, { target: { value: "a" } });

    await waitFor(() => {
      const badge = screen.getByTestId("search-result-count");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("4 results");
    });
  });
});
