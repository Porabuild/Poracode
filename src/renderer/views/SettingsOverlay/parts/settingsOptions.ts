import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { SelectOption } from "@/renderer/components/common";
import { KEEP_AWAKE_CONDITIONS, type KeepAwakeCondition } from "@/shared/settings";

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

export const followUpBehaviorOptions = [
  { id: "queue", label: msg`Queue` },
  { id: "steer", label: msg`Steer` },
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

/** Conditions shared by the Prevent system sleep and Prevent screen lock rows. */
export const keepAwakeConditionOptions = [
  { id: "working", label: msg`Working` },
  { id: "computer-use", label: msg`Computer Use` },
  { id: "remote-access", label: msg`Remote access` },
  { id: "always", label: msg`Always` },
] as const satisfies readonly (LocalizedOption & { id: KeepAwakeCondition })[];

/**
 * Applies a multiselect change: newly picking "Always" replaces the other
 * conditions, and picking another condition clears "Always".
 */
export function resolveKeepAwakeSelection(
  previous: readonly KeepAwakeCondition[],
  next: readonly string[],
): KeepAwakeCondition[] {
  const conditions = KEEP_AWAKE_CONDITIONS.filter((condition) => next.includes(condition));
  if (!conditions.includes("always")) return conditions;
  if (!previous.includes("always")) return ["always"];
  return conditions.length > 1
    ? conditions.filter((condition) => condition !== "always")
    : conditions;
}

export const gitReviewModeOptions = [
  { id: "panel", label: msg`Panel` },
  { id: "page", label: msg`Page` },
] as const satisfies readonly LocalizedOption[];

export const prCreateModeOptions = [
  { id: "dialog", label: msg`Open dialog` },
  { id: "auto", label: msg`Auto-generate` },
] as const satisfies readonly LocalizedOption[];

export const prMergeMethodOptions = [
  { id: "merge", label: msg`Merge PR: Commit` },
  { id: "squash", label: msg`Merge PR: Squash` },
  { id: "rebase", label: msg`Merge PR: Rebase` },
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
