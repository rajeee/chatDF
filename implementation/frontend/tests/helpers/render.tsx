// Custom render that wraps components with all required providers:
// - QueryClientProvider with a fresh QueryClient (retries disabled)
// - MemoryRouter for routing context
//
// Usage:
//   import { renderWithProviders } from "../helpers/render";
//   const { getByText } = renderWithProviders(<MyComponent />);

import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

interface ProviderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial route for MemoryRouter. Defaults to "/" */
  route?: string;
  /** Provide a custom QueryClient if needed */
  queryClient?: QueryClient;
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  { route = "/", queryClient, ...renderOptions }: ProviderOptions = {}
) {
  const testQueryClient = queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient: testQueryClient,
  };
}

// Re-export everything from testing-library for convenience
export { screen, waitFor, within, act } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
