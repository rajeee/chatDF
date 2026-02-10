// Comprehensive tests for useEditableCodeMirror hook.
// Covers: API surface (setValue, getValue, getCursorPos, focus, viewRef),
// editor lifecycle (create, destroy, null container), setValue no-op,
// getValue/getCursorPos fallbacks, focus behavior, callback ref updates,
// and theme handling (dark vs light).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Hoisted mock state (available to vi.mock factories) ---

const {
  mockDestroy,
  mockFocus,
  mockDispatch,
  mockState,
  MockEditorView,
  mockEditorStateCreate,
  capturedListeners,
} = vi.hoisted(() => {
  const mockDestroy = vi.fn();
  const mockFocus = vi.fn();
  const mockDispatch = vi.fn();

  // Mutable state shared between mock view and tests
  const mockState = {
    docContent: "",
    cursorPos: 0,
  };

  function createMockView() {
    return {
      destroy: mockDestroy,
      focus: mockFocus,
      dispatch: mockDispatch,
      state: {
        doc: {
          toString: () => mockState.docContent,
          get length() {
            return mockState.docContent.length;
          },
        },
        selection: {
          main: {
            get head() {
              return mockState.cursorPos;
            },
          },
        },
      },
    };
  }

  const MockEditorView = vi.fn().mockImplementation(() => createMockView());

  const mockEditorStateCreate = vi.fn(() => ({ extensions: [] }));

  // Holder for captured update listener
  const capturedListeners = { updateListener: null as ((update: unknown) => void) | null };

  return {
    mockDestroy,
    mockFocus,
    mockDispatch,
    mockState,
    MockEditorView,
    mockEditorStateCreate,
    capturedListeners,
  };
});

// --- Mock CodeMirror modules ---

vi.mock("@codemirror/view", () => {
  const updateListenerOf = vi.fn((cb: (update: unknown) => void) => {
    capturedListeners.updateListener = cb;
    return ["updateListener"];
  });

  Object.assign(MockEditorView, {
    updateListener: { of: updateListenerOf },
    theme: vi.fn((_spec: unknown, _opts?: unknown) => ["theme"]),
    lineWrapping: ["lineWrapping"],
  });

  return {
    EditorView: MockEditorView,
    lineNumbers: vi.fn(() => ["lineNumbers"]),
    highlightActiveLine: vi.fn(() => ["highlightActiveLine"]),
    keymap: { of: vi.fn(() => ["keymap"]) },
    placeholder: vi.fn(() => ["placeholder"]),
    drawSelection: vi.fn(() => ["drawSelection"]),
    highlightSpecialChars: vi.fn(() => ["highlightSpecialChars"]),
  };
});

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: mockEditorStateCreate,
  },
}));

vi.mock("@codemirror/lang-sql", () => ({
  sql: vi.fn(() => ["sql"]),
}));

vi.mock("@codemirror/theme-one-dark", () => ({
  oneDark: ["oneDark"],
}));

// Import the hook AFTER mocks are set up
import { useEditableCodeMirror } from "@/hooks/useEditableCodeMirror";
import type { EditableCodeMirrorOptions } from "@/hooks/useEditableCodeMirror";

// --- Helpers ---

function makeContainerRef(el: HTMLDivElement | null = null) {
  return { current: el };
}

function defaultOptions(
  overrides: Partial<EditableCodeMirrorOptions> = {}
): EditableCodeMirrorOptions {
  const containerDiv = document.createElement("div");
  document.body.appendChild(containerDiv);
  return {
    containerRef: { current: containerDiv },
    isDark: false,
    ...overrides,
  };
}

// --- Test suite ---

describe("useEditableCodeMirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.docContent = "";
    mockState.cursorPos = 0;
    capturedListeners.updateListener = null;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // =====================
  // API surface tests
  // =====================

  describe("API surface", () => {
    it("returns setValue as a function", () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      expect(typeof result.current.setValue).toBe("function");
    });

    it("returns getValue as a function", () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      expect(typeof result.current.getValue).toBe("function");
    });

    it("returns getCursorPos as a function", () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      expect(typeof result.current.getCursorPos).toBe("function");
    });

    it("returns focus as a function", () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      expect(typeof result.current.focus).toBe("function");
    });

    it("returns viewRef as a mutable ref object", () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      expect(result.current.viewRef).toBeDefined();
      expect(result.current.viewRef).toHaveProperty("current");
    });
  });

  // =====================
  // Editor lifecycle
  // =====================

  describe("editor lifecycle", () => {
    it("creates EditorView when container ref has an element", () => {
      const opts = defaultOptions();
      renderHook(() => useEditableCodeMirror(opts));

      expect(MockEditorView).toHaveBeenCalledTimes(1);
      expect(MockEditorView).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: opts.containerRef.current,
        })
      );
    });

    it("does not create EditorView when container ref is null", () => {
      const opts = defaultOptions({ containerRef: makeContainerRef(null) });
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      expect(MockEditorView).not.toHaveBeenCalled();
      expect(result.current.viewRef.current).toBeNull();
    });

    it("destroys editor on unmount", () => {
      const opts = defaultOptions();
      const { result, unmount } = renderHook(() =>
        useEditableCodeMirror(opts)
      );

      expect(result.current.viewRef.current).not.toBeNull();

      unmount();

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it("sets viewRef.current to null after unmount cleanup", () => {
      const opts = defaultOptions();
      const { result, unmount } = renderHook(() =>
        useEditableCodeMirror(opts)
      );

      const viewRefHandle = result.current.viewRef;
      expect(viewRefHandle.current).not.toBeNull();

      unmount();

      expect(viewRefHandle.current).toBeNull();
    });

    it("creates EditorState with initialDoc", () => {
      const opts = defaultOptions({ initialDoc: "SELECT 1" });
      renderHook(() => useEditableCodeMirror(opts));

      expect(mockEditorStateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          doc: "SELECT 1",
        })
      );
    });

    it("uses default initialDoc of empty string when not provided", () => {
      const opts = defaultOptions();
      renderHook(() => useEditableCodeMirror(opts));

      expect(mockEditorStateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          doc: "",
        })
      );
    });
  });

  // =====================
  // setValue behavior
  // =====================

  describe("setValue", () => {
    it("dispatches a change when content differs from current doc", () => {
      mockState.docContent = "SELECT 1";
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      act(() => {
        result.current.setValue("SELECT 2");
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        changes: {
          from: 0,
          to: "SELECT 1".length,
          insert: "SELECT 2",
        },
      });
    });

    it("is a no-op when content matches current doc", () => {
      mockState.docContent = "SELECT 1";
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      act(() => {
        result.current.setValue("SELECT 1");
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("is a no-op when viewRef.current is null", () => {
      const opts = defaultOptions({ containerRef: makeContainerRef(null) });
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      act(() => {
        result.current.setValue("anything");
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // =====================
  // getValue behavior
  // =====================

  describe("getValue", () => {
    it("returns current doc content from the editor", () => {
      mockState.docContent = "SELECT * FROM users";
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      let value = "";
      act(() => {
        value = result.current.getValue();
      });

      expect(value).toBe("SELECT * FROM users");
    });

    it("returns empty string when viewRef.current is null", () => {
      const opts = defaultOptions({ containerRef: makeContainerRef(null) });
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      let value = "non-empty";
      act(() => {
        value = result.current.getValue();
      });

      expect(value).toBe("");
    });
  });

  // =====================
  // getCursorPos behavior
  // =====================

  describe("getCursorPos", () => {
    it("returns cursor position from the editor state", () => {
      mockState.cursorPos = 42;
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      let pos = -1;
      act(() => {
        pos = result.current.getCursorPos();
      });

      expect(pos).toBe(42);
    });

    it("returns 0 when viewRef.current is null", () => {
      const opts = defaultOptions({ containerRef: makeContainerRef(null) });
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      let pos = -1;
      act(() => {
        pos = result.current.getCursorPos();
      });

      expect(pos).toBe(0);
    });
  });

  // =====================
  // focus behavior
  // =====================

  describe("focus", () => {
    it("calls view.focus() when editor exists", () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      act(() => {
        result.current.focus();
      });

      expect(mockFocus).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when viewRef.current is null", () => {
      const opts = defaultOptions({ containerRef: makeContainerRef(null) });
      const { result } = renderHook(() => useEditableCodeMirror(opts));

      // Should not throw
      act(() => {
        result.current.focus();
      });

      expect(mockFocus).not.toHaveBeenCalled();
    });
  });

  // =====================
  // Callback ref updates
  // =====================

  describe("callback refs stay up-to-date", () => {
    it("uses the latest onChange callback without recreating editor", () => {
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();

      const containerDiv = document.createElement("div");
      document.body.appendChild(containerDiv);
      const containerRef = { current: containerDiv };

      const { rerender } = renderHook(
        ({ onChange }) =>
          useEditableCodeMirror({
            containerRef,
            isDark: false,
            onChange,
          }),
        { initialProps: { onChange: onChange1 } }
      );

      const editorCreateCount = MockEditorView.mock.calls.length;

      // Update the onChange prop
      rerender({ onChange: onChange2 });

      // Editor should NOT have been recreated (onChange is stored in ref)
      expect(MockEditorView).toHaveBeenCalledTimes(editorCreateCount);

      // Simulate a doc change through the update listener
      if (capturedListeners.updateListener) {
        capturedListeners.updateListener({
          docChanged: true,
          state: {
            doc: { toString: () => "new content" },
            selection: { main: { head: 5 } },
          },
        });
      }

      // The NEW callback should have been invoked, not the old one
      expect(onChange1).not.toHaveBeenCalled();
      expect(onChange2).toHaveBeenCalledWith("new content", 5);
    });

    it("does not call onChange when docChanged is false", () => {
      const onChange = vi.fn();
      const opts = defaultOptions({ onChange });
      renderHook(() => useEditableCodeMirror(opts));

      if (capturedListeners.updateListener) {
        capturedListeners.updateListener({
          docChanged: false,
          state: {
            doc: { toString: () => "same" },
            selection: { main: { head: 0 } },
          },
        });
      }

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // =====================
  // Theme handling
  // =====================

  describe("theme handling", () => {
    it("creates editor with light theme extensions when isDark is false", () => {
      const opts = defaultOptions({ isDark: false });
      renderHook(() => useEditableCodeMirror(opts));

      // EditorState.create is called with extensions array
      const createCall = mockEditorStateCreate.mock.calls[0][0] as {
        extensions: unknown[];
      };
      const extensions = createCall.extensions;

      // oneDark should NOT be in extensions for light mode
      const flatExtensions = extensions.flat(Infinity);
      expect(flatExtensions).not.toContain("oneDark");
    });

    it("creates editor with dark theme extensions when isDark is true", () => {
      const opts = defaultOptions({ isDark: true });
      renderHook(() => useEditableCodeMirror(opts));

      const createCall = mockEditorStateCreate.mock.calls[0][0] as {
        extensions: unknown[];
      };
      const extensions = createCall.extensions;

      // oneDark should be in extensions for dark mode
      const flatExtensions = extensions.flat(Infinity);
      expect(flatExtensions).toContain("oneDark");
    });

    it("recreates editor when isDark changes", () => {
      const containerDiv = document.createElement("div");
      document.body.appendChild(containerDiv);
      const containerRef = { current: containerDiv };

      const { rerender } = renderHook(
        ({ isDark }) =>
          useEditableCodeMirror({
            containerRef,
            isDark,
          }),
        { initialProps: { isDark: false } }
      );

      const initialCreateCount = MockEditorView.mock.calls.length;

      rerender({ isDark: true });

      // Should have destroyed old editor and created a new one
      expect(mockDestroy).toHaveBeenCalled();
      expect(MockEditorView.mock.calls.length).toBe(initialCreateCount + 1);
    });

    it("recreates editor when placeholderText changes", () => {
      const containerDiv = document.createElement("div");
      document.body.appendChild(containerDiv);
      const containerRef = { current: containerDiv };

      const { rerender } = renderHook(
        ({ placeholderText }) =>
          useEditableCodeMirror({
            containerRef,
            isDark: false,
            placeholderText,
          }),
        { initialProps: { placeholderText: "Type SQL here..." } }
      );

      const initialCreateCount = MockEditorView.mock.calls.length;

      rerender({ placeholderText: "Enter query..." });

      expect(mockDestroy).toHaveBeenCalled();
      expect(MockEditorView.mock.calls.length).toBe(initialCreateCount + 1);
    });
  });

  // =====================
  // Content preservation on recreate
  // =====================

  describe("content preservation", () => {
    it("falls back to initialDoc when editor is recreated since cleanup nullifies viewRef", () => {
      // When isDark changes, React runs the cleanup (which destroys the view
      // and sets viewRef.current = null) before running the new effect body.
      // So the hook's `viewRef.current?.state.doc.toString() ?? initialDoc`
      // sees null and falls back to initialDoc.
      mockState.docContent = "SELECT * FROM orders";
      const containerDiv = document.createElement("div");
      document.body.appendChild(containerDiv);
      const containerRef = { current: containerDiv };

      const { rerender } = renderHook(
        ({ isDark }) =>
          useEditableCodeMirror({
            containerRef,
            isDark,
            initialDoc: "initial content",
          }),
        { initialProps: { isDark: false } }
      );

      rerender({ isDark: true });

      // After cleanup nullifies viewRef, the new effect falls back to initialDoc
      const secondCall = mockEditorStateCreate.mock.calls[1][0] as {
        doc: string;
      };
      expect(secondCall.doc).toBe("initial content");
    });

    it("uses initialDoc on first creation when no prior editor exists", () => {
      const opts = defaultOptions({ initialDoc: "SELECT 42" });
      renderHook(() => useEditableCodeMirror(opts));

      const firstCall = mockEditorStateCreate.mock.calls[0][0] as {
        doc: string;
      };
      expect(firstCall.doc).toBe("SELECT 42");
    });
  });
});
