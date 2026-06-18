import { ClipboardList, Hammer } from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";

/**
 * Plan/Work toggle shared by Claude, Codex, Copilot, Cursor, Gemini, and
 * OpenCode. Each provider decides what "plan mode" means in its config space
 * (e.g. `mode === "plan"` vs `mode !== "agent"`) and supplies the predicate
 * and onChange action; this builder just produces the toggle JSX.
 */
export function planWorkToggle(input: {
  isPlanMode: boolean;
  isDisabled: boolean;
  onChange: (isSelected: boolean) => void;
}): ComposerControl {
  return {
    kind: "toggle",
    icon: input.isPlanMode ? (
      <ClipboardList className="size-3.5" />
    ) : (
      <Hammer className="size-3.5" />
    ),
    label: input.isPlanMode ? "Plan" : "Work",
    displayLabel: input.isPlanMode ? msg`Plan` : msg`Work`,
    hideLabelOnWrap: true,
    isSelected: input.isPlanMode,
    isCurrentState: true,
    isDisabled: input.isDisabled,
    onChange: input.onChange,
  };
}

/**
 * Full access / Supervised permission toggle shared by Codex (CLI), Copilot,
 * Cursor, and OpenCode. The provider decides which approval-policy / sandbox
 * values represent "full access" and "supervised"; this builder handles only
 * the label/icon shape.
 */
export function fullAccessToggle(input: {
  isFullAccess: boolean;
  isDisabled: boolean;
  onChange: (isSelected: boolean) => void;
}): ComposerControl {
  return {
    kind: "toggle",
    label: input.isFullAccess ? "Full access" : "Supervised",
    displayLabel: input.isFullAccess ? msg`Full access` : msg`Supervised`,
    iconKind: "permission",
    isSelected: input.isFullAccess,
    isCurrentState: true,
    hideLabelOnWrap: true,
    isDisabled: input.isDisabled,
    onChange: input.onChange,
  };
}
