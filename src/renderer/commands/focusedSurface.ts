/**
 * Marker classes the editor / terminal surfaces put on their root elements.
 * "Which surface owns focus" is derived from these in several places (the `when`
 * context, Find routing, tab cycling), so the selectors live here once rather
 * than as magic strings scattered across call sites.
 */
const EDITOR_FOCUS_SELECTOR = ".monaco-editor";
const TERMINAL_FOCUS_SELECTOR = ".xterm";

export function resolveFocusElement(target?: EventTarget | null): Element | null {
  const element = target instanceof Element ? target : document.activeElement;
  return element instanceof Element ? element : null;
}

/** True when `element` is inside a Monaco editor surface. */
export function isEditorFocusElement(element: Element | null | undefined): boolean {
  return Boolean(element?.closest(EDITOR_FOCUS_SELECTOR));
}

/** True when `element` is inside an xterm terminal surface. */
export function isTerminalFocusElement(element: Element | null | undefined): boolean {
  return Boolean(element?.closest(TERMINAL_FOCUS_SELECTOR));
}
