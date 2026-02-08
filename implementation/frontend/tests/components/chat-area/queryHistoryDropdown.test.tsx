// Tests for QueryHistoryDropdown responsive layout
import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import { QueryHistoryDropdown } from "@/components/chat-area/QueryHistoryDropdown";

beforeEach(() => {
  resetAllStores();
  // Add a query to history so button is enabled
  useQueryHistoryStore.getState().addQuery("SELECT * FROM users");
});

describe("QueryHistoryDropdown responsive layout", () => {
  it("dropdown has responsive width classes for mobile", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderWithProviders(
      <QueryHistoryDropdown onSelectQuery={() => {}} />
    );

    const button = screen.getByTestId("query-history-button");
    await user.click(button);

    const dropdown = screen.getByTestId("query-history-dropdown");
    // Mobile-first: viewport-aware width on small screens, fixed 384px on sm+
    expect(dropdown.className).toContain("w-[calc(100vw-2rem)]");
    expect(dropdown.className).toContain("sm:w-96");
  });

  it("dropdown renders with right-0 positioning", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderWithProviders(
      <QueryHistoryDropdown onSelectQuery={() => {}} />
    );

    const button = screen.getByTestId("query-history-button");
    await user.click(button);

    const dropdown = screen.getByTestId("query-history-dropdown");
    expect(dropdown.className).toContain("right-0");
    expect(dropdown.className).toContain("bottom-full");
  });
});
