const KEYBOARD_NAV_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type.toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

/** Show focus indicators only during keyboard navigation. Pointer interaction
 * and initial/programmatic focus stay quiet everywhere across the app. */
export function installKeyboardFieldFocus() {
  const root = document.documentElement;
  let generation = 0;
  let disposed = false;
  const enableKeyboardNavigation = () => {
    if (!disposed) root.setAttribute("data-keyboard-navigation", "");
  };
  const clearKeyboardNavigation = () => {
    generation += 1;
    root.removeAttribute("data-keyboard-navigation");
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!isTextEntryTarget(event.target)) {
      if (event.key === "Tab" || KEYBOARD_NAV_KEYS.has(event.key)) {
        enableKeyboardNavigation();
      }
      return;
    }
    const target = event.target as HTMLElement;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Combobox inputs navigate popup options with Up/Down arrows while DOM
      // focus stays on the input; other text fields only enter keyboard mode
      // if the key actually moves focus out to a non-text element (e.g. a menu).
      if (target.getAttribute("role") === "combobox") {
        enableKeyboardNavigation();
        return;
      }
      const scheduledGeneration = generation;
      queueMicrotask(() => {
        if (disposed || generation !== scheduledGeneration) return;
        const active = document.activeElement;
        if (active !== target && !isTextEntryTarget(active)) {
          enableKeyboardNavigation();
        }
      });
    }
  };
  const onKeyDownBubble = (event: KeyboardEvent) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "Tab" || !isTextEntryTarget(event.target)) return;
    // Tab inside a text control (e.g. terminal/composer completion) that calls
    // preventDefault() without moving focus should not turn on focus rings.
    if (!event.defaultPrevented || document.activeElement !== event.target) {
      enableKeyboardNavigation();
    }
  };
  window.addEventListener("keydown", onKeyDownCapture, true);
  window.addEventListener("keydown", onKeyDownBubble, false);
  window.addEventListener("pointerdown", clearKeyboardNavigation, true);
  window.addEventListener("mousedown", clearKeyboardNavigation, true);
  window.addEventListener("blur", clearKeyboardNavigation);
  return () => {
    disposed = true;
    window.removeEventListener("keydown", onKeyDownCapture, true);
    window.removeEventListener("keydown", onKeyDownBubble, false);
    window.removeEventListener("pointerdown", clearKeyboardNavigation, true);
    window.removeEventListener("mousedown", clearKeyboardNavigation, true);
    window.removeEventListener("blur", clearKeyboardNavigation);
    clearKeyboardNavigation();
  };
}
