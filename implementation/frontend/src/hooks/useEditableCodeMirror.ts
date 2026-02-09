// Editable CodeMirror 6 hook for the RunSqlPanel SQL editor.
// Creates a fully interactive editor with SQL syntax highlighting,
// line numbers, active line highlight, and custom keybindings.
//
// NOTE: Do NOT modify useCodeMirror.ts — that hook is read-only for SQLPanel display.

import { useEffect, useRef, useCallback, type RefObject } from "react";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
  placeholder as cmPlaceholder,
  drawSelection,
  highlightSpecialChars,
} from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";

export interface EditableCodeMirrorOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  initialDoc?: string;
  isDark: boolean;
  onChange?: (value: string, cursorPos: number) => void;
  onExecute?: () => void;
  onFormat?: () => void;
  placeholderText?: string;
}

export interface EditableCodeMirrorAPI {
  /** Programmatically set the editor content */
  setValue: (doc: string) => void;
  /** Get the current editor content */
  getValue: () => string;
  /** Get the current cursor position (character offset) */
  getCursorPos: () => number;
  /** Focus the editor */
  focus: () => void;
  /** The EditorView ref (null until mounted) */
  viewRef: React.MutableRefObject<EditorView | null>;
}

// Light theme base styling — gives a clean, minimal look when not using oneDark
const lightTheme = EditorView.theme({
  "&": {
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  ".cm-content": {
    padding: "6px 0",
    caretColor: "var(--color-text, #333)",
  },
  ".cm-line": {
    padding: "0 8px",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--color-text, #333)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "none",
    color: "var(--color-text-muted, #999)",
    fontSize: "10px",
    minWidth: "2.5em",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  ".cm-placeholder": {
    color: "var(--color-text-muted, #999)",
    fontStyle: "italic",
  },
});

// Dark theme overrides (applied on top of oneDark)
const darkThemeOverrides = EditorView.theme({
  "&": {
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  ".cm-content": {
    padding: "6px 0",
  },
  ".cm-line": {
    padding: "0 8px",
  },
  ".cm-gutters": {
    borderRight: "none",
    fontSize: "10px",
    minWidth: "2.5em",
  },
  ".cm-placeholder": {
    fontStyle: "italic",
  },
}, { dark: true });

export function useEditableCodeMirror(
  options: EditableCodeMirrorOptions
): EditableCodeMirrorAPI {
  const {
    containerRef,
    initialDoc = "",
    isDark,
    onChange,
    onExecute,
    onFormat,
    placeholderText = "SELECT * FROM table_name LIMIT 10",
  } = options;

  const viewRef = useRef<EditorView | null>(null);

  // Store callbacks in refs so the editor extensions see latest values
  // without requiring editor recreation on every callback change
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  const onFormatRef = useRef(onFormat);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    onFormatRef.current = onFormat;
  }, [onFormat]);

  // Create/recreate editor when container or theme changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Preserve content from previous editor if it exists
    const existingContent = viewRef.current?.state.doc.toString() ?? initialDoc;

    const extensions: Extension[] = [
      // SQL syntax highlighting
      sql(),

      // Basic editor features
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      highlightSpecialChars(),

      // Placeholder text
      cmPlaceholder(placeholderText),

      // Update listener — fires onChange with new doc + cursor position
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          const doc = update.state.doc.toString();
          const cursor = update.state.selection.main.head;
          onChangeRef.current(doc, cursor);
        }
      }),

      // Custom keybindings for Cmd/Ctrl+Enter (execute) and Cmd/Ctrl+Shift+F (format)
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            onExecuteRef.current?.();
            return true;
          },
        },
        {
          key: "Mod-Shift-f",
          run: () => {
            onFormatRef.current?.();
            return true;
          },
        },
      ]),

      // Wrap long lines so editor doesn't scroll horizontally
      EditorView.lineWrapping,
    ];

    // Theme
    if (isDark) {
      extensions.push(oneDark, darkThemeOverrides);
    } else {
      extensions.push(lightTheme);
    }

    const state = EditorState.create({
      doc: existingContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, isDark, placeholderText]);

  const setValue = useCallback((doc: string) => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === doc) return; // no-op if same
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
    });
  }, []);

  const getValue = useCallback((): string => {
    return viewRef.current?.state.doc.toString() ?? "";
  }, []);

  const getCursorPos = useCallback((): number => {
    return viewRef.current?.state.selection.main.head ?? 0;
  }, []);

  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  return { setValue, getValue, getCursorPos, focus, viewRef };
}
