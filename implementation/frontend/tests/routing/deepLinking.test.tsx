// Deep-linking tests for /c/:conversationId route.
//
// DL-1: Navigating to /c/:id loads the correct conversation
// DL-2: Switching conversations updates the URL
// DL-3: Navigating to / shows no active conversation
// DL-4: Invalid conversation IDs are handled gracefully (app renders, does not crash)
// DL-5: Creating a new conversation updates the URL

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import React from "react";
import { server } from "../helpers/mocks/server";
import { createUser } from "../helpers/mocks/data";
import { resetAllStores } from "../helpers/stores";
import { useChatStore } from "@/stores/chatStore";

import App from "@/App";

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Renders App at a given route and returns a helper to inspect the current URL path. */
function renderApp(route = "/") {
  const queryClient = createTestQueryClient();
  let currentPath = route;

  // MemoryRouter doesn't expose location directly; we use a LocationDisplay component
  // to capture it.
  function LocationDisplay() {
    // Use React Router's useLocation to show current path
    const { pathname } = require("react-router-dom").useLocation();
    currentPath = pathname;
    return <div data-testid="location-display">{pathname}</div>;
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return {
    ...result,
    queryClient,
    getPath: () => currentPath,
    getPathFromDom: () =>
      result.getByTestId("location-display").textContent ?? "",
  };
}

describe("Deep Linking - /c/:conversationId", () => {
  beforeEach(() => {
    resetAllStores();
    // Default: authenticated user
    server.use(
      http.get("/auth/me", () => HttpResponse.json(createUser()))
    );
  });

  // DL-1: Navigating to /c/:id loads the correct conversation
  it("DL-1: navigating to /c/:id sets the active conversation", async () => {
    const targetId = "conv-deep-link-1";

    // Mock the specific conversation endpoint
    server.use(
      http.get("/conversations/:id", ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          title: "Deep Link Test",
          messages: [],
          datasets: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dataset_count: 0,
          message_count: 0,
          last_message_preview: null,
        });
      })
    );

    renderApp(`/c/${targetId}`);

    // Wait for the app shell to render (auth check passes)
    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    // The chatStore should have the active conversation set to the URL param
    await waitFor(() => {
      expect(useChatStore.getState().activeConversationId).toBe(targetId);
    });
  });

  // DL-2: Switching conversations updates the URL
  it("DL-2: changing activeConversationId updates the URL to /c/:id", async () => {
    server.use(
      http.get("/conversations/:id", ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          title: "Switched Conversation",
          messages: [],
          datasets: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dataset_count: 0,
          message_count: 0,
          last_message_preview: null,
        });
      })
    );

    const { getPathFromDom } = renderApp("/");

    // Wait for app to render
    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    // Initially at /
    expect(getPathFromDom()).toBe("/");

    // Simulate switching to a conversation (as the sidebar would do)
    const newConvId = "conv-switched-42";
    act(() => {
      useChatStore.getState().setActiveConversation(newConvId);
    });

    // URL should update to /c/:id
    await waitFor(() => {
      expect(getPathFromDom()).toBe(`/c/${newConvId}`);
    });
  });

  // DL-3: Navigating to / shows no active conversation
  it("DL-3: navigating to / results in no active conversation", async () => {
    renderApp("/");

    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    // Should have no active conversation
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  // DL-4: Invalid conversation IDs are handled gracefully
  it("DL-4: invalid conversation ID does not crash the app", async () => {
    const invalidId = "nonexistent-conv-999";

    // Return 404 for the invalid conversation
    server.use(
      http.get("/conversations/:id", () => {
        return HttpResponse.json(
          { error: "Not found" },
          { status: 404 }
        );
      })
    );

    renderApp(`/c/${invalidId}`);

    // The app shell should still render without crashing
    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    // The store will have the conversation ID set (it tries to load it)
    expect(useChatStore.getState().activeConversationId).toBe(invalidId);
  });

  // DL-5: Setting activeConversationId to null navigates back to /
  it("DL-5: clearing active conversation navigates to /", async () => {
    const convId = "conv-to-clear";

    server.use(
      http.get("/conversations/:id", ({ params }) => {
        return HttpResponse.json({
          id: params.id,
          title: "Will Be Cleared",
          messages: [],
          datasets: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dataset_count: 0,
          message_count: 0,
          last_message_preview: null,
        });
      })
    );

    const { getPathFromDom } = renderApp(`/c/${convId}`);

    // Wait for app to render
    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    // Should be at /c/:id
    await waitFor(() => {
      expect(getPathFromDom()).toBe(`/c/${convId}`);
    });

    // Clear the active conversation (e.g. user clicks "new conversation")
    act(() => {
      useChatStore.getState().setActiveConversation(null);
    });

    // URL should go back to /
    await waitFor(() => {
      expect(getPathFromDom()).toBe("/");
    });
  });
});
