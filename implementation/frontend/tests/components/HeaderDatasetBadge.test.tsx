import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { Header } from "@/components/Header";

beforeEach(() => {
  resetAllStores();
  useConnectionStore.setState({ status: "connected" });
});

describe("Header dataset count badge", () => {
  it("shows no badge when no datasets exist", () => {
    renderWithProviders(<Header />);
    expect(screen.queryByTestId("dataset-count-badge")).not.toBeInTheDocument();
  });

  it("shows badge with count when ready datasets exist", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-1", url: "http://b.com/b.parquet", name: "B", row_count: 200, column_count: 3, schema_json: "{}", status: "ready", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("2");
  });

  it("does not count loading or error datasets", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-1", url: "http://b.com/b.parquet", name: "B", row_count: 0, column_count: 0, schema_json: "{}", status: "loading", error_message: null },
        { id: "d3", conversation_id: "conv-1", url: "http://c.com/c.parquet", name: "C", row_count: 0, column_count: 0, schema_json: "{}", status: "error", error_message: "fail" },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge.textContent).toBe("1");
  });

  it("does not count datasets from other conversations", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useDatasetStore.setState({
      datasets: [
        { id: "d1", conversation_id: "conv-1", url: "http://a.com/a.parquet", name: "A", row_count: 100, column_count: 5, schema_json: "{}", status: "ready", error_message: null },
        { id: "d2", conversation_id: "conv-2", url: "http://b.com/b.parquet", name: "B", row_count: 200, column_count: 3, schema_json: "{}", status: "ready", error_message: null },
      ],
    });

    renderWithProviders(<Header />);
    const badge = screen.getByTestId("dataset-count-badge");
    expect(badge.textContent).toBe("1");
  });
});
