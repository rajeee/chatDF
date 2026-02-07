// Tests: spec/frontend/chat_area/sql_panel/spec.md
// Verifies the SQL Modal component (replaced SQLPanel)
//
// SM-DISPLAY-1: Shows SQL executions in modal
// SM-CLOSE-1: Close via X button / backdrop / Escape
// SM-RESULT-1: View Output opens result modal

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, userEvent, act } from "../../helpers/render";
import { SQLModal } from "@/components/chat-area/SQLPanel";
import { useUiStore } from "@/stores/uiStore";
import type { SqlExecution } from "@/stores/chatStore";

// Mock the useCodeMirror hook to avoid jsdom + CodeMirror incompatibility.
vi.mock("@/hooks/useCodeMirror", () => ({
  useCodeMirror: () => {},
}));

const sampleExecutions: SqlExecution[] = [
  {
    query: "SELECT id, name FROM users WHERE active = true ORDER BY name",
    columns: ["id", "name"],
    rows: [[1, "Alice"], [2, "Bob"]],
    total_rows: 2,
    error: null,
  },
  {
    query: "SELECT count(*) FROM orders",
    columns: ["count"],
    rows: [[42]],
    total_rows: 1,
    error: null,
  },
];

beforeEach(() => {
  useUiStore.getState().closeSqlModal();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SM-DISPLAY-1: Shows SQL executions in modal", () => {
  it("renders nothing when sqlModalOpen is false", () => {
    renderWithProviders(<SQLModal />);
    expect(screen.queryByTestId("sql-modal")).not.toBeInTheDocument();
  });

  it("renders the modal when opened via uiStore", () => {
    useUiStore.getState().openSqlModal(sampleExecutions);
    renderWithProviders(<SQLModal />);
    expect(screen.getByTestId("sql-modal")).toBeInTheDocument();
  });

  it("shows execution count in header", () => {
    useUiStore.getState().openSqlModal(sampleExecutions);
    renderWithProviders(<SQLModal />);
    expect(screen.getByText("SQL Queries (2)")).toBeInTheDocument();
  });

  it("shows query labels", () => {
    useUiStore.getState().openSqlModal(sampleExecutions);
    renderWithProviders(<SQLModal />);
    expect(screen.getByText("Query 1")).toBeInTheDocument();
    expect(screen.getByText("Query 2")).toBeInTheDocument();
  });
});

describe("SM-CLOSE-1: Close via X button", () => {
  it("closes modal when X button is clicked", async () => {
    useUiStore.getState().openSqlModal(sampleExecutions);
    const user = userEvent.setup();
    renderWithProviders(<SQLModal />);

    const closeBtn = screen.getByRole("button", { name: /close sql modal/i });
    await user.click(closeBtn);

    expect(useUiStore.getState().sqlModalOpen).toBe(false);
  });
});

describe("SM-CLOSE-2: Escape key closes the modal", () => {
  it("closes modal when Escape is pressed", async () => {
    useUiStore.getState().openSqlModal(sampleExecutions);
    const user = userEvent.setup();
    renderWithProviders(<SQLModal />);

    await user.keyboard("{Escape}");

    expect(useUiStore.getState().sqlModalOpen).toBe(false);
  });
});

describe("SM-RESULT-1: View Output button", () => {
  it("shows View Output buttons for executions with columns", () => {
    useUiStore.getState().openSqlModal(sampleExecutions);
    renderWithProviders(<SQLModal />);

    const viewBtns = screen.getAllByText(/View Output/);
    expect(viewBtns).toHaveLength(2);
  });

  it("does not show View Output for executions without columns", () => {
    const errorExecution: SqlExecution[] = [
      { query: "BAD SQL", columns: null, rows: null, total_rows: null, error: "syntax error" },
    ];
    useUiStore.getState().openSqlModal(errorExecution);
    renderWithProviders(<SQLModal />);

    expect(screen.queryByText(/View Output/)).not.toBeInTheDocument();
    expect(screen.getByText("Show Error")).toBeInTheDocument();
  });
});
