/**
 * Process-wide stack for overlay Escape handling. Only the topmost overlay
 * dismisses on a given Escape press, so the browser drawer floating above
 * Settings closes the drawer first and leaves Settings intact.
 *
 * Each overlay pushes a close handler on mount/open and pops it on
 * unmount/close. A single window-level capture listener routes the keypress
 * to the top of the stack.
 */

type Handler = () => void;

const stack: Handler[] = [];
let listenerInstalled = false;

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const handler = stack[stack.length - 1];
  if (!handler) return;
  event.preventDefault();
  event.stopPropagation();
  handler();
}

export function pushEscapeHandler(handler: Handler): () => void {
  if (!listenerInstalled) {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    listenerInstalled = true;
  }
  stack.push(handler);
  return () => {
    const idx = stack.lastIndexOf(handler);
    if (idx >= 0) stack.splice(idx, 1);
  };
}
