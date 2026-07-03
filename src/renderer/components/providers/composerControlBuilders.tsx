import { ClipboardList, Hammer } from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";

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
    // The `lightcode-composer-mode-icon` marker is a provider-agnostic hook the
    // mobile compact composer keys off to surface the mode chip as an icon; it
    // rides the shared builder so every provider's plan/work toggle carries it.
    icon: input.isPlanMode ? (
      <ClipboardList className="size-3.5 lightcode-composer-mode-icon" />
    ) : (
      <Hammer className="size-3.5 lightcode-composer-mode-icon" />
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

/**
 * Approval-policy dropdown shared by Antigravity, Claude, Command Code, and
 * Gemini. Produces a menu control bound to `capabilities.approvalPolicies`.
 */
export function approvalPolicyDropdown(input: {
  policies: AgentCapability["approvalPolicies"];
  currentPolicy: string;
  isDisabled: boolean;
  onChange: (value: string) => void;
}): ComposerControl {
  return {
    iconKind: "permission" as const,
    options: input.policies,
    hideLabelOnWrap: true,
    value: input.currentPolicy,
    isDisabled: input.isDisabled,
    onChange: input.onChange,
  };
}

/**
 * Standard composer controls shared by providers that combine a conditional
 * plan/work toggle (when 2 modes are available) with a conditional
 * approval-policy dropdown. Used by Antigravity, Command Code, and Gemini.
 */
export function standardPlanApprovalControls(input: {
  capabilities: AgentCapability;
  config: ThreadConfig;
  isDisabled: boolean;
  onConfigChange: (patch: Partial<ThreadConfig>) => void;
}): ComposerControl[] {
  const { capabilities, config, isDisabled, onConfigChange } = input;
  const isPlanMode = (config.mode ?? "agent") !== "agent";
  return [
    ...(capabilities.modes.length === 2
      ? [
          planWorkToggle({
            isPlanMode,
            isDisabled,
            onChange: (isSelected) => onConfigChange({ mode: isSelected ? "plan" : "agent" }),
          }),
        ]
      : []),
    ...(capabilities.approvalPolicies.length > 0
      ? [
          approvalPolicyDropdown({
            policies: capabilities.approvalPolicies,
            currentPolicy:
              config.approvalPolicy ?? capabilities.approvalPolicies[0]?.id ?? "default",
            isDisabled,
            onChange: (value) => onConfigChange({ approvalPolicy: value }),
          }),
        ]
      : []),
  ];
}
