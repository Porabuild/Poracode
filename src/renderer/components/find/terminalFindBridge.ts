/**
 * Module-level handle to the focused terminal's find controller. The xterm
 * surface registers an opener on focus/mount; the global Find command calls it.
 * "Active" = last focused terminal, matching the focus-based routing in
 * {@link ./findController}.
 */
export interface TerminalFindController {
  open(): void;
}

let activeController: TerminalFindController | null = null;

export function setActiveTerminalFind(controller: TerminalFindController | null): void {
  activeController = controller;
}

/** Clear only if `controller` is still the active one, so a non-focused
 * terminal unmounting can't wipe the focused terminal's registration. */
export function clearActiveTerminalFind(controller: TerminalFindController): void {
  if (activeController === controller) activeController = null;
}

export function openTerminalFind(): boolean {
  if (!activeController) return false;
  activeController.open();
  return true;
}
