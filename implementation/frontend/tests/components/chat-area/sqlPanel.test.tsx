// Tests: spec/frontend/chat_area/sql_panel/spec.md
// Verifies: spec/frontend/chat_area/sql_panel/plan.md
//
// SP-DISPLAY-1: Shows SQL content in the panel
// SP-COPY-1: Copy button copies SQL to clipboard
// SP-CLOSE-1: X button closes the panel
// SP-CLOSE-2: Escape key closes the panel
// SP-THEME-1: Theme matches app theme (light/dark)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, userEvent, act } from "../../helpers/render";
import { SQLPanel } from "@/components/chat-area/SQLPanel";

// Mock the useCodeMirror hook to avoid jsdom + CodeMirror incompatibility.
// We track the last call args to verify that the SQL content and dark mode
// flag are passed through correctly.
let lastUseCodeMirrorArgs: { doc: string; isDark: boolean } | null = null;

vi.mock("@/hooks/useCodeMirror", () => ({
  useCodeMirror: (
    _containerRef: unknown,
    doc: string,
    isDark: boolean
  ) => {
    lastUseCodeMirrorArgs = { doc, isDark };
  },
}));

// --- Mock clipboard ---
const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
  writeTextMock.mockClear();
  lastUseCodeMirrorArgs = null;
});

afterEach(() => {
  vi.useRealTimers();
});

const sampleSQL = "SELECT id, name FROM users WHERE active = true ORDER BY name";

describe("SP-DISPLAY-1: Shows SQL content", () => {
  it("renders the SQL panel with 'SQL Query' heading", () => {
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(screen.getByText("SQL Query")).toBeInTheDocument();
  });

  it("passes SQL content to useCodeMirror hook", () => {
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(lastUseCodeMirrorArgs).not.toBeNull();
    expect(lastUseCodeMirrorArgs!.doc).toBe(sampleSQL);
  });

  it("renders the panel container with expected test id", () => {
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(screen.getByTestId("sql-panel")).toBeInTheDocument();
  });

  it("renders the CodeMirror container div", () => {
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(screen.getByTestId("codemirror-container")).toBeInTheDocument();
  });
});

describe("SP-COPY-1: Copy button copies SQL to clipboard", () => {
  it("renders a copy button", () => {
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("copies SQL to clipboard when copy button is clicked", async () => {
    const user = userEvent.setup();
    // Spy on the clipboard after userEvent.setup() to capture the actual call
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );

    const copyBtn = screen.getByRole("button", { name: /copy/i });
    await user.click(copyBtn);

    expect(clipboardSpy).toHaveBeenCalledWith(sampleSQL);
    clipboardSpy.mockRestore();
  });

  it("shows 'Copied!' feedback after clicking copy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );

    const copyBtn = screen.getByRole("button", { name: /copy/i });
    await user.click(copyBtn);

    expect(screen.getByText("Copied!")).toBeInTheDocument();

    // After 1.5 seconds the "Copied!" text should revert
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});

describe("SP-CLOSE-1: X button closes the panel", () => {
  it("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={onClose} />
    );

    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SP-CLOSE-2: Escape key closes the panel", () => {
  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={onClose} />
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SP-THEME-1: Theme matches app theme", () => {
  it("passes isDark=false to useCodeMirror in light mode", () => {
    document.documentElement.classList.remove("dark");
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(lastUseCodeMirrorArgs).not.toBeNull();
    expect(lastUseCodeMirrorArgs!.isDark).toBe(false);
  });

  it("passes isDark=true to useCodeMirror in dark mode", () => {
    document.documentElement.classList.add("dark");
    renderWithProviders(
      <SQLPanel sql={sampleSQL} onClose={vi.fn()} />
    );
    expect(lastUseCodeMirrorArgs).not.toBeNull();
    expect(lastUseCodeMirrorArgs!.isDark).toBe(true);
    document.documentElement.classList.remove("dark");
  });
});
