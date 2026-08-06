/**
 * Bridge between the shared notes panel and the mobile shell. A to-do row
 * requests an action menu on long press; the PWA registers the single sheet
 * host that presents it. Desktop keeps the existing right-click context menu.
 */
export interface TodoActionsRequest {
  /** To-do text shown as the sheet preview. */
  text: string;
  /** Opens the current to-do in its inline text editor. */
  requestRename: () => void;
  /** Seeds and opens a draft thread from the current to-do. */
  requestNewThread: () => void;
  /** Removes the current to-do, matching the desktop context menu. */
  requestRemove: () => void;
}

type TodoActionsListener = (request: TodoActionsRequest) => void;

let activeListener: TodoActionsListener | null = null;

export function setTodoActionsListener(listener: TodoActionsListener | null): void {
  activeListener = listener;
}

export function openTodoActions(request: TodoActionsRequest): void {
  activeListener?.(request);
}
