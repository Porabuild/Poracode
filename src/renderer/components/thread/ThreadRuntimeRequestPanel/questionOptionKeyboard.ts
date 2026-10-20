import type { KeyboardEvent } from "react";

const NAVIGATION_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);

/**
 * Navigate choices without selecting (arrows wrap, Home/End jump to the ends);
 * number keys activate the matching visible option.
 */
export function handleQuestionOptionKey(event: KeyboardEvent, container: HTMLElement): boolean {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229
  )
    return false;
  const number = /^[1-9]$/.test(event.key) ? Number(event.key) : undefined;
  if (number === undefined && !NAVIGATION_KEYS.has(event.key)) return false;
  const target = event.target as HTMLElement;
  // The inline custom-answer row keeps digits and Home/End for its text but
  // still moves between rows with the arrows.
  const isCustomRow =
    target instanceof HTMLInputElement &&
    target.type === "text" &&
    target.hasAttribute("data-question-option");
  if (isCustomRow ? !event.key.startsWith("Arrow") : ownsOptionKeys(target)) return false;

  const options = [
    ...container.querySelectorAll<HTMLButtonElement | HTMLInputElement>("[data-question-option]"),
  ];
  const available = options.filter((option) => !option.disabled);
  if (available.length === 0) return false;
  const choice = number === undefined ? undefined : options[number - 1];
  if (number !== undefined) {
    if (!choice || choice.disabled) return false;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) {
      choice.focus();
      choice.click();
    }
    return true;
  }
  const index = available.findIndex((option) => option === document.activeElement);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? available.length - 1
        : index < 0
          ? event.key === "ArrowUp"
            ? available.length - 1
            : 0
          : (index + (event.key === "ArrowUp" ? -1 : 1) + available.length) % available.length;
  event.preventDefault();
  event.stopPropagation();
  available[nextIndex]?.focus();
  return true;
}

/** Typed answers, native pickers and custom-value editors own their keys. */
function ownsOptionKeys(target: HTMLElement): boolean {
  return (
    !!target.closest(
      'textarea, select, [contenteditable]:not([contenteditable="false"]), [data-question-enter-local], [role="tab"]',
    ) ||
    (target instanceof HTMLInputElement && target.type !== "checkbox" && target.type !== "radio")
  );
}
