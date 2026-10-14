import type { KeyboardEvent } from "react";

/** Navigate choices without selecting; number keys activate the matching visible option. */
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
  if (number === undefined && event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
  const target = event.target as HTMLElement;
  // Typed answers, native pickers and custom-value editors own their keys.
  if (
    target.closest(
      'textarea, select, [contenteditable]:not([contenteditable="false"]), [data-question-enter-local]',
    ) ||
    (target instanceof HTMLInputElement && target.type !== "checkbox" && target.type !== "radio") ||
    target.closest('[role="tab"]')
  )
    return false;

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
    index < 0
      ? event.key === "ArrowUp"
        ? available.length - 1
        : 0
      : (index + (event.key === "ArrowUp" ? -1 : 1) + available.length) % available.length;
  event.preventDefault();
  event.stopPropagation();
  available[nextIndex]?.focus();
  return true;
}
