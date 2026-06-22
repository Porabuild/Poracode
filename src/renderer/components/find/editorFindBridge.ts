/**
 * Module-level handle to the focused Monaco editor so the global Find command
 * can open Monaco's own first-class find widget. The file-editor pane registers
 * its instance on mount/focus and clears it on unmount. "Active" = last focused,
 * which matches the focus-based routing in {@link ./findController}.
 */
export interface FindableEditor {
  focus(): void;
  getAction(id: string): { run: () => unknown } | null;
}

let activeEditor: FindableEditor | null = null;

export function setActiveFindEditor(editor: FindableEditor | null): void {
  activeEditor = editor;
}

/** Open Monaco's built-in find widget on the active editor. Returns false when
 * there is no editor or the action is unavailable. */
export function openEditorFind(): boolean {
  if (!activeEditor) return false;
  activeEditor.focus();
  const action = activeEditor.getAction("actions.find");
  if (!action) return false;
  action.run();
  return true;
}
