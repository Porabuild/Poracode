/**
 * Process-wide stack for overlay Escape handling. Only the topmost overlay
 * dismisses on a given Escape press, so the browser drawer floating above
 * Settings closes the drawer first and leaves Settings intact.
 *
 * Each overlay pushes a close handler on mount/open and pops it on
 * unmount/close. A single window-level capture listener routes the keypress
 * to the top of the stack. The listener is installed only while the stack is
 * non-empty so that Escape reaches terminals, editors, and inputs unimpeded
 * when no overlay is visible.
 */

type Handler = () => void;

const stack: Handler[] = [];
let listenerInstalled = false;

function installListener(): void {
  if (listenerInstalled) return;
  window.addEventListener("keydown", onKeyDown, { capture: true });
  listenerInstalled = true;
}

function uninstallListener(): void {
  if (!listenerInstalled) return;
  window.removeEventListener("keydown", onKeyDown, { capture: true });
  listenerInstalled = false;
}

/**
 * Elements that must receive Escape presses directly even while an overlay is
 * visible — e.g. a terminal inside a login overlay, a Monaco editor inside the
 * file-editor overlay, or an open mention popover inside a sub-agent drawer.
 */
const FOCUS_RETAINS_ESCAPE = ".xterm, .monaco-editor, .lightcode-mention-input";

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;

  const target = event.target as HTMLElement | null;
  if (target?.closest(FOCUS_RETAINS_ESCAPE)) return;

  const handler = stack[stack.length - 1];
  if (!handler) return;
  event.preventDefault();
  event.stopPropagation();
  handler();
}

export function pushEscapeHandler(handler: Handler): () => void {
  stack.push(handler);
  installListener();
  return () => {
    const idx = stack.lastIndexOf(handler);
    if (idx >= 0) stack.splice(idx, 1);
    if (stack.length === 0) uninstallListener();
  };
}
