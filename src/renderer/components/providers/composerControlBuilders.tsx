import { ClipboardList, Hammer } from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import type { ComposerControlsInput } from "./providerComposer";

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
    // The `poracode-composer-mode-icon` marker is a provider-agnostic hook the
    // mobile compact composer keys off to surface the mode chip as an icon; it
    // rides the shared builder so every provider's plan/work toggle carries it.
    icon: input.isPlanMode ? (
      <ClipboardList className="size-3.5 poracode-composer-mode-icon" />
    ) : (
      <Hammer className="size-3.5 poracode-composer-mode-icon" />
    ),
    iconKind: "mode",
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
  restrictedLabel?: string;
  restrictedDisplayLabel?: MessageDescriptor;
  onChange: (isSelected: boolean) => void;
}): ComposerControl {
  return {
    kind: "toggle",
    label: input.isFullAccess ? "Full access" : (input.restrictedLabel ?? "Supervised"),
    displayLabel: input.isFullAccess
      ? msg`Full access`
      : (input.restrictedDisplayLabel ?? msg`Supervised`),
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
/**
 * The chip label is looked up by id, so an id the active surface does not
 * advertise falls through to the raw value (`yolo` instead of `YOLO`). A
 * thread can hold one after switching presentation surfaces or after a
 * provider's capability set changes, so resolve against what is on offer now,
 * preferring the provider's declared default over the first entry.
 */
export function resolveComposerApprovalPolicy(
  capabilities: AgentCapability,
  config: ThreadConfig,
): string {
  const policies = capabilities.approvalPolicies;
  const advertises = (id: string | undefined) =>
    id !== undefined && policies.some((policy) => policy.id === id);
  if (advertises(config.approvalPolicy)) return config.approvalPolicy!;
  if (advertises(capabilities.defaultApprovalPolicy)) return capabilities.defaultApprovalPolicy!;
  return policies[0]?.id ?? "default";
}

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
            currentPolicy: resolveComposerApprovalPolicy(capabilities, config),
            isDisabled,
            onChange: (value) => onConfigChange({ approvalPolicy: value }),
          }),
        ]
      : []),
  ];
}

/**
 * Composer controls shared by ACP-backed providers. Agents with only the
 * protocol's synthetic default/never policies get a compact toggle; agents
 * advertising richer policy sets get the full dropdown.
 */
export function buildAcpComposerControls({
  capabilities,
  config,
  isDisabled,
  onConfigChange,
}: ComposerControlsInput): ComposerControl[] {
  const controls: ComposerControl[] = [];
  if (capabilities.modes.includes("plan")) {
    controls.push(
      planWorkToggle({
        isPlanMode: config.mode === "plan",
        isDisabled,
        onChange: (isSelected) => onConfigChange({ mode: isSelected ? "plan" : "agent" }),
      }),
    );
  }

  const approvalPolicyIds = new Set(capabilities.approvalPolicies.map((policy) => policy.id));
  const usesSyntheticBypassToggle =
    capabilities.approvalPolicies.length === 0 ||
    (capabilities.approvalPolicies.length === 1 && approvalPolicyIds.has("default")) ||
    (approvalPolicyIds.has("never") &&
      (capabilities.approvalPolicies.length === 1 ||
        (capabilities.approvalPolicies.length === 2 && approvalPolicyIds.has("default"))));

  if (usesSyntheticBypassToggle) {
    const isAutoApprove = config.approvalPolicy === "never";
    controls.push({
      kind: "toggle",
      label: isAutoApprove ? "Auto Approve" : "Supervised",
      displayLabel: isAutoApprove ? msg`Auto Approve` : msg`Supervised`,
      iconKind: "permission",
      isSelected: isAutoApprove,
      isCurrentState: true,
      hideLabelOnWrap: true,
      isDisabled,
      onChange: (isSelected) =>
        onConfigChange({ approvalPolicy: isSelected ? "never" : "default" }),
    });
  } else if (capabilities.approvalPolicies.length > 0) {
    controls.push(
      approvalPolicyDropdown({
        policies: capabilities.approvalPolicies,
        currentPolicy: resolveComposerApprovalPolicy(capabilities, config),
        isDisabled,
        onChange: (value) => onConfigChange({ approvalPolicy: value }),
      }),
    );
  }

  return controls;
}
