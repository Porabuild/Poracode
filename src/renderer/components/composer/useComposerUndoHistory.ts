import { useRef, type RefObject } from "react";
import {
  captureEditorSnapshot,
  restoreEditorSnapshot,
  snapshotsEqual,
  type EditorSnapshot,
} from "./editorSnapshot";
import { createUndoHistory, type UndoHistory } from "./undoHistory";

/** Native input types that merge into one undo step while the user keeps typing or deleting. */
function groupForInputType(inputType: string): string | undefined {
  if (inputType === "insertText") return "insert";
  if (inputType.startsWith("delete") && inputType !== "deleteByCut") return "delete";
  return undefined;
}

/**
 * Undo history for the composer's contentEditable. The composer edits the DOM
 * directly for chips, pastes and voice input, and Chromium's native undo stack
 * only records edits Chromium made itself, so the composer keeps its own
 * history and handles every undo and redo.
 *
 * Call `sync` before an edit so the history sees the latest caret, and
 * `commit` after it. `edit` wraps both around a programmatic change.
 */
export function useComposerUndoHistory(
  editorRef: RefObject<HTMLDivElement | null>,
  onRestored: () => void,
) {
  const historyRef = useRef<UndoHistory<EditorSnapshot> | null>(null);

  function history(editor: HTMLDivElement): UndoHistory<EditorSnapshot> {
    historyRef.current ??= createUndoHistory({ initial: captureEditorSnapshot(editor) });
    return historyRef.current;
  }

  function sync() {
    const editor = editorRef.current;
    if (!editor) return;
    const snapshot = captureEditorSnapshot(editor);
    const current = history(editor);
    if (!snapshotsEqual(snapshot, current.current())) current.replaceCurrent(snapshot);
  }

  function commit(group?: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const snapshot = captureEditorSnapshot(editor);
    const current = history(editor);
    if (snapshot.html === current.current().html) {
      current.replaceCurrent(snapshot);
    } else {
      current.record(snapshot, group);
    }
  }

  function step(direction: "undo" | "redo") {
    const editor = editorRef.current;
    if (!editor) return;
    sync();
    const target = direction === "undo" ? history(editor).undo() : history(editor).redo();
    if (!target) return;
    restoreEditorSnapshot(editor, target);
    onRestored();
  }

  return {
    sync,
    commit,
    /** Record a programmatic edit as its own undo step. */
    edit(run: () => void) {
      sync();
      run();
      commit();
    },
    /** Record a native edit, merging runs of typing or deleting into one step. */
    commitInput(inputType: string) {
      commit(groupForInputType(inputType));
    },
    /** Forget every step, e.g. after submit or when a saved draft loads. */
    reset() {
      const editor = editorRef.current;
      if (!editor) return;
      history(editor).reset(captureEditorSnapshot(editor));
    },
    undo() {
      step("undo");
    },
    redo() {
      step("redo");
    },
  };
}

/** Which history action a key press asks for, if any. */
export function historyActionForKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.shiftKey) return "redo";
  return null;
}
