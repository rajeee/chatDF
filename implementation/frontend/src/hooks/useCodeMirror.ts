// Implements: spec/frontend/chat_area/sql_panel/plan.md#codemirror-integration
//
// Custom hook to manage CodeMirror 6 editor lifecycle.
// Handles creation, destruction, and theme sync.

import { useEffect, useRef, type RefObject } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";

export function useCodeMirror(
  containerRef: RefObject<HTMLDivElement | null>,
  doc: string,
  isDark: boolean
): void {
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const extensions = [
      sql(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc,
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
  }, [containerRef, doc, isDark]);
}
