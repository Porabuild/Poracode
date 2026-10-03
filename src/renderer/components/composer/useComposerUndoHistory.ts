import { useRef, type RefObject } from "react";
import {
  captureEditorSnapshot,
  restoreEditorSnapshot,
  snapshotsEqual,
  type EditorSnapshot,
} from "./editorSnapshot";
import { createUndoHistory, type UndoHistory } from "./undoHistory";

/**
 * Native input types that merge into one undo step. Runs of typing or
 * deleting merge while the user keeps going. Dragging text inside the editor
 * fires deleteByDrag then insertFromDrop, which merge so one undo puts the
 * text back where it was.
 */
function groupForInputType(inputType: string): string | undefined {
  if (inputType === "insertText") return "insert";
  if (inputType === "deleteByDrag" || inputType === "insertFromDrop") return "drag";
  if (inputType.startsWith("delete") && inputType !== "deleteByCut") return "delete";
  return undefined;
}

/**
 * Undo history for the composer's contentEditable. The composer edits the DOM
 * directly for chips, pastes and voice input, and Chromium's native undo stack
 * only records edits Chromium made itself, so the composer keeps its own
 * history and handles every undo and redo.
 *
 * Call `beforeInput` before a native edit so the history sees the latest
 * caret, and `commitInput` after it. `edit` wraps a programmatic change.
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

  /**
   * Bring the current step up to date with the editor before an edit. A moved
   * caret ends the current typing run. `startStep` ends it even if nothing moved.
   */
  function sync(startStep = false) {
    const editor = editorRef.current;
    if (!editor) return;
    const snapshot = captureEditorSnapshot(editor);
    const undoHistory = history(editor);
    if (startStep || !snapshotsEqual(snapshot, undoHistory.current())) {
      undoHistory.replaceCurrent(snapshot);
    }
  }

  function commit(group?: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const snapshot = captureEditorSnapshot(editor);
    const undoHistory = history(editor);
    if (snapshot.html === undoHistory.current().html) {
      undoHistory.replaceCurrent(snapshot);
    } else {
      undoHistory.record(snapshot, group);
    }
  }

  function apply(action: "undo" | "redo") {
    const editor = editorRef.current;
    if (!editor) return;
    const undoHistory = history(editor);
    // Fold in content the history missed, but keep the caret each step saved:
    // redo puts the caret where the edit left it, not where the user moved it.
    const snapshot = captureEditorSnapshot(editor);
    if (snapshot.html !== undoHistory.current().html) undoHistory.replaceCurrent(snapshot);
    const target = action === "undo" ? undoHistory.undo() : undoHistory.redo();
    if (!target) return;
    restoreEditorSnapshot(editor, target);
    onRestored();
  }

  return {
    /** Record a programmatic edit as its own undo step. */
    edit(run: () => void) {
      sync();
      run();
      commit();
    },
    /** Call from the native beforeinput event, before Chromium changes the DOM. */
    beforeInput(inputType: string) {
      // The drop half of a drag merges into the step its deleteByDrag started,
      // so the caret jump to the drop point must not end that step.
      if (inputType === "insertFromDrop") return;
      sync(inputType === "deleteByDrag");
    },
    /** Record a native edit, merging runs of typing or deleting into one step. */
    commitInput(inputType: string) {
      if (inputType === "historyUndo" || inputType === "historyRedo") {
        // Chromium ran its own undo without a cancelable beforeinput, as
        // document.execCommand("undo") does. Put back the step the history
        // knows and take ours instead.
        const editor = editorRef.current;
        if (!editor) return;
        restoreEditorSnapshot(editor, history(editor).current());
        apply(inputType === "historyUndo" ? "undo" : "redo");
        return;
      }
      commit(groupForInputType(inputType));
    },
    /** Call when an IME composition starts. */
    compositionStart() {
      sync();
    },
    /** Record a finished IME composition as one step. */
    compositionEnd() {
      commit();
    },
    /** Forget every step, as after submit or when a saved draft loads. */
    reset() {
      const editor = editorRef.current;
      if (!editor) return;
      history(editor).reset(captureEditorSnapshot(editor));
    },
    /** Step back or forward one edit and restore the editor to match. */
    apply,
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
