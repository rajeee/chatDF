// Tests for ProtectedRoute component
// Covers: loading state, authenticated rendering, unauthenticated redirect
//
// The ProtectedRoute component wraps children with auth gating:
// - Shows "Loading..." while auth state is being fetched
// - Renders children when user is authenticated
// - Redirects to /sign-in when user is not authenticated

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { http, HttpResponse } from "msw";
import React from "react";
import { server } from "../../helpers/mocks/server";
import { createUser } from "../../helpers/mocks/data";
import { resetAllStores } from "../../helpers/stores";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Render the ProtectedRoute with full routing context so we can verify
 * both the children rendering and the Navigate redirect behavior.
 */
function renderProtectedRoute(
  childContent = "Protected Content",
  queryClient?: QueryClient
) {
  const qc = queryClient ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>{childContent}</div>
              </ProtectedRoute>
            }
          />
          <Route path="/sign-in" element={<div>Sign In Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("shows loading text while auth is loading", () => {
    // Use a handler that never resolves so the query stays in loading state
    server.use(
      http.get("/auth/me", async () => {
        await new Promise(() => {});
        return HttpResponse.json(createUser());
      })
    );

    renderProtectedRoute();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders children when user is authenticated", async () => {
    server.use(
      http.get("/auth/me", () => HttpResponse.json(createUser()))
    );

    renderProtectedRoute("Protected Content");

    await waitFor(() => {
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  it("redirects to /sign-in when user is not authenticated", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText("Sign In Page")).toBeInTheDocument();
    });
  });

  it("does not render children when not authenticated", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    renderProtectedRoute("Secret Data");

    await waitFor(() => {
      expect(screen.getByText("Sign In Page")).toBeInTheDocument();
    });

    expect(screen.queryByText("Secret Data")).not.toBeInTheDocument();
  });

  it("children content is accessible when authenticated", async () => {
    server.use(
      http.get("/auth/me", () => HttpResponse.json(createUser()))
    );

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <main>
                    <h1>Dashboard</h1>
                    <p>Welcome back</p>
                  </main>
                </ProtectedRoute>
              }
            />
            <Route path="/sign-in" element={<div>Sign In Page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.queryByText("Sign In Page")).not.toBeInTheDocument();
  });

  it("loading state renders with proper container classes", () => {
    server.use(
      http.get("/auth/me", async () => {
        await new Promise(() => {});
        return HttpResponse.json(createUser());
      })
    );

    const { container } = renderProtectedRoute();

    const loadingDiv = container.querySelector(
      ".flex.items-center.justify-center.min-h-screen"
    );
    expect(loadingDiv).toBeInTheDocument();
    expect(loadingDiv).toContainHTML("<p>Loading...</p>");
  });

  it("does not show loading text after auth resolves as authenticated", async () => {
    server.use(
      http.get("/auth/me", () => HttpResponse.json(createUser()))
    );

    renderProtectedRoute("My App");

    // Initially should show loading
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // After auth resolves, loading disappears and children render
    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("does not show loading text after auth resolves as unauthenticated", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    renderProtectedRoute();

    // Initially should show loading
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // After auth resolves, should redirect to sign-in
    await waitFor(() => {
      expect(screen.getByText("Sign In Page")).toBeInTheDocument();
    });

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
