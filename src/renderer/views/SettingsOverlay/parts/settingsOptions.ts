import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { SelectOption } from "@/renderer/components/common";

/**
 * Settings dropdown options. Labels are lazy `msg` descriptors (module-level
 * macros must use `msg`, not `t`) and resolved to strings at render time via
 * {@link useLocalizedOptions}. Numeric option lists (scroll speed, font size)
 * stay plain strings — "2x"/"12px" are locale-agnostic.
 */
interface LocalizedOption {
  id: string;
  label: MessageDescriptor;
}

export const themeOptions = [
  { id: "system", label: msg`System` },
  { id: "light", label: msg`Light` },
  { id: "dark", label: msg`Dark` },
] as const satisfies readonly LocalizedOption[];

export const terminalPositionOptions = [
  { id: "right", label: msg`Right` },
  { id: "bottom", label: msg`Bottom` },
] as const satisfies readonly LocalizedOption[];

export const threadRemoveActionOptions = [
  { id: "archive", label: msg`Archive` },
  {
    id: "delete",
    label: msg({ message: "Delete", comment: "Thread remove action: delete permanently" }),
  },
] as const satisfies readonly LocalizedOption[];

export const cliPickerTargetOptions = [
  { id: "ask", label: msg`Ask each time` },
  { id: "terminal", label: msg`Terminal input` },
  { id: "composer", label: msg`Composer` },
] as const satisfies readonly LocalizedOption[];

export const newThreadModeOptions = [
  { id: "page", label: msg`Page` },
  { id: "panel", label: msg`Panel` },
] as const satisfies readonly LocalizedOption[];

export const gitReviewModeOptions = [
  { id: "panel", label: msg`Panel` },
  { id: "page", label: msg`Page` },
] as const satisfies readonly LocalizedOption[];

export const prCreateModeOptions = [
  { id: "dialog", label: msg`Open dialog` },
  { id: "auto", label: msg`Auto-generate` },
] as const satisfies readonly LocalizedOption[];

export const worktreeStorageModeOptions = [
  { id: "global", label: msg`Global folder` },
  { id: "project-relative", label: msg`Inside each project` },
] as const satisfies readonly LocalizedOption[];

export const projectWorktreeLocationOptions = [
  { id: "global", label: msg`Custom` },
  { id: "project-relative", label: msg`Inside this project` },
] as const satisfies readonly LocalizedOption[];

export const scrollSpeedOptions = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  label: `${i + 1}x`,
})) as readonly SelectOption[];

export const fontSizeOptions = Array.from({ length: 13 }, (_, i) => ({
  id: String(i + 8),
  label: `${i + 8}px`,
})) as readonly SelectOption[];

/**
 * Resolve a list of `msg`-descriptor options to plain `{ id, label }` strings
 * for `Select`. Re-resolves when the active locale changes.
 */
export function useLocalizedOptions(options: readonly LocalizedOption[]): SelectOption[] {
  const { t } = useLingui();
  return options.map((option) => ({ id: option.id, label: t(option.label) }));
}
