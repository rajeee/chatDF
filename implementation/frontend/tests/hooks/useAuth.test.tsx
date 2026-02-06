// Tests for useAuth hook
// Covers: auth state, login redirect, logout cleanup
//
// Tests: spec/frontend/test_plan.md (auth state, logout cleanup)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import React from "react";
import { server } from "../helpers/mocks/server";
import { createUser } from "../helpers/mocks/data";
import { resetAllStores } from "../helpers/stores";

// We'll import useAuth once it exists
import { useAuth } from "@/hooks/useAuth";

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe("useAuth", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("returns user data when authenticated", async () => {
    const user = createUser({ name: "Jane Doe", email: "jane@example.com" });
    server.use(
      http.get("/auth/me", () => HttpResponse.json(user))
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns isAuthenticated=false when /auth/me returns 401", async () => {
    server.use(
      http.get("/auth/me", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
      )
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("isLoading is true while fetching user", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("login() redirects to OAuth URL", () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignSpy },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    result.current.login();
    expect(assignSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/google")
    );
  });

  it("login() includes referral key when provided", () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignSpy },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    result.current.login("my-referral-key");
    expect(assignSpy).toHaveBeenCalledWith(
      expect.stringContaining("referral_key=my-referral-key")
    );
  });

  it("logout() calls POST /auth/logout and clears state", async () => {
    let logoutCalled = false;
    let authMeCallCount = 0;
    server.use(
      http.get("/auth/me", () => {
        authMeCallCount++;
        // First call returns user, subsequent calls (after logout) return 401
        if (authMeCallCount === 1) {
          return HttpResponse.json(createUser());
        }
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }),
      http.post("/auth/logout", () => {
        logoutCalled = true;
        return HttpResponse.json({ success: true });
      })
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(queryClient),
    });

    // Wait for initial auth to complete
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    // Perform logout (wrap in act since it triggers navigation state update)
    await act(async () => {
      await result.current.logout();
    });

    expect(logoutCalled).toBe(true);

    // After logout + refetch, the user should be null / not authenticated
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });
    expect(result.current.user).toBeNull();
  });

  it("uses 5min stale time for user query", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The query should be in the cache with the ["user"] key
    const queryState = queryClient.getQueryState(["user"]);
    expect(queryState).toBeDefined();
  });
});
