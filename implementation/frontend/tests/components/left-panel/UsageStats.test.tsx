// Tests: spec/frontend/left_panel/test_plan.md#usage-stats-tests
// Verifies: spec/frontend/left_panel/usage_stats/plan.md
//
// US-1: Progress bar renders with correct width
// US-2: Normal color (accent) at low usage
// US-3: Warning color (orange/amber) at 80%+
// US-4: Limit color (red) at 100%
// US-5: Number formatting (compact label)
// US-6: Expanded view shows details

import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { createUsageStats } from "../../helpers/mocks/data";
import { UsageStats } from "@/components/left-panel/UsageStats";

beforeEach(() => {
  resetAllStores();
});

describe("US-1: Progress bar renders", () => {
  it("renders progress bar with correct percentage width", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 2_500_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      const bar = screen.getByTestId("usage-progress-bar");
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveStyle({ width: "50%" });
    });
  });
});

describe("US-2: Normal color at low usage", () => {
  it("shows accent/blue color when usage is under 80%", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 1_000_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      const bar = screen.getByTestId("usage-progress-bar");
      expect(bar).toHaveAttribute("data-state", "normal");
    });
  });
});

describe("US-3: Warning color at 80%+", () => {
  it("shows warning/amber color when usage is at 80%", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 4_000_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      const bar = screen.getByTestId("usage-progress-bar");
      expect(bar).toHaveAttribute("data-state", "warning");
    });
  });
});

describe("US-4: Limit color at 100%", () => {
  it("shows limit/red color when usage reaches 100%", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 5_000_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      const bar = screen.getByTestId("usage-progress-bar");
      expect(bar).toHaveAttribute("data-state", "limit");
    });
  });

  it("shows 'Daily limit reached' text at 100%", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 5_000_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      expect(screen.getByText("Daily limit reached")).toBeInTheDocument();
    });
  });
});

describe("US-5: Number formatting", () => {
  it("formats large numbers in compact form (e.g., '1.5M / 5M tokens')", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 1_500_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      expect(screen.getByTestId("usage-label")).toHaveTextContent("1.5M / 5M tokens");
    });
  });

  it("formats sub-million numbers with k suffix", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 500_000, token_limit: 5_000_000 })
        );
      })
    );

    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      expect(screen.getByTestId("usage-label")).toHaveTextContent("500k / 5M tokens");
    });
  });
});

describe("US-6: Expanded view", () => {
  it("shows expanded details when clicked", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 1_245_320, token_limit: 5_000_000 })
        );
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      expect(screen.getByTestId("usage-toggle")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("usage-toggle"));

    expect(screen.getByTestId("usage-expanded")).toBeInTheDocument();
    // Shows formatted full numbers
    expect(screen.getByText(/1,245,320/)).toBeInTheDocument();
  });

  it("hides expanded details when clicked again", async () => {
    server.use(
      http.get("/usage", () => {
        return HttpResponse.json(
          createUsageStats({ tokens_used: 1_000_000, token_limit: 5_000_000 })
        );
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<UsageStats />);

    await waitFor(() => {
      expect(screen.getByTestId("usage-toggle")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("usage-toggle"));
    expect(screen.getByTestId("usage-expanded")).toBeInTheDocument();

    await user.click(screen.getByTestId("usage-toggle"));
    expect(screen.queryByTestId("usage-expanded")).not.toBeInTheDocument();
  });
});
