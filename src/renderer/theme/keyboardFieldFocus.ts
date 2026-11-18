/** Keep pointer and initial focus quiet. Tab navigation needs a distinct indicator,
 * including when the focused element is inside a portal or compound field. */
export function installKeyboardFieldFocus() {
  const root = document.documentElement;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") root.setAttribute("data-keyboard-navigation", "");
  };
  const onPointerDown = () => root.removeAttribute("data-keyboard-navigation");
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    root.removeAttribute("data-keyboard-navigation");
  };
}
