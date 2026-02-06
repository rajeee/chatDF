// Routing tests for App.tsx
// Tests: spec/frontend/test_plan.md (FE-R-1 through FE-R-3)
//
// FE-R-1: Unauthenticated user at / redirects to /sign-in
// FE-R-2: Authenticated user at / renders app content
// FE-R-3: Sign-in page renders with expected elements

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import React from "react";
import { server } from "../helpers/mocks/server";
import { createUser } from "../helpers/mocks/data";
import { resetAllStores } from "../helpers/stores";

import App from "@/App";

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderApp(route = "/") {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Routing", () => {
  beforeEach(() => {
    resetAllStores();
  });

  // FE-R-1: Unauthenticated redirects to /sign-in
  it("FE-R-1: redirects unauthenticated user from / to /sign-in", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    renderApp("/");

    // Should eventually show the sign-in page content
    await waitFor(() => {
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    });
  });

  // FE-R-2: Authenticated renders app
  it("FE-R-2: renders app content for authenticated user at /", async () => {
    server.use(
      http.get("/auth/me", () => HttpResponse.json(createUser()))
    );

    renderApp("/");

    // Should show the app shell (not sign-in)
    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    // Should NOT show sign-in elements
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
  });

  // FE-R-3: Sign-in page renders
  it("FE-R-3: sign-in page renders with expected elements", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    renderApp("/sign-in");

    await waitFor(() => {
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    });

    // Should have a referral key input
    expect(screen.getByPlaceholderText(/referral key/i)).toBeInTheDocument();
  });

  it("FE-R-3: sign-in page shows error from URL params", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    renderApp("/sign-in?error=invalid_key");

    await waitFor(() => {
      expect(screen.getByText(/invalid_key/i)).toBeInTheDocument();
    });
  });

  it("shows loading state while checking auth", () => {
    // Use a handler that delays response
    server.use(
      http.get("/auth/me", async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json(createUser());
      })
    );

    renderApp("/");

    // Should show a loading indicator while auth is being checked
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
