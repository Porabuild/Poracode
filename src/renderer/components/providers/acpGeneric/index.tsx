import { msg } from "@lingui/core/macro";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { planWorkToggle } from "../composerControlBuilders";
import { registerComposerControls } from "../ProviderIcon";

registerComposerControls("acp-generic", ({ capabilities, config, isDisabled, onConfigChange }) => {
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
    controls.push({
      iconKind: "permission",
      options: capabilities.approvalPolicies,
      hideLabelOnWrap: true,
      value: config.approvalPolicy ?? capabilities.approvalPolicies[0]?.id ?? "default",
      isDisabled,
      onChange: (value) => onConfigChange({ approvalPolicy: value }),
    });
  }

  return controls;
});
