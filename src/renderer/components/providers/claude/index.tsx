export * from "./ClaudeIcon";

import { ClaudeIcon } from "./ClaudeIcon";
import { planWorkToggle } from "../composerControlBuilders";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
  registerWorkflowTrigger,
} from "../ProviderIcon";

registerProviderIcon("claude", ClaudeIcon);
registerProviderLabel("claude", "Claude Code");
registerCommitGenDefaults("claude", {
  label: "Claude",
  hint: "Sonnet high",
  model: "sonnet",
  effort: "high",
});
registerTitleGenDefaults("claude", {
  label: "Claude",
  hint: "Haiku medium",
  model: "haiku",
  effort: "medium",
});
registerConflictResolverDefaults("claude", {
  label: "Claude",
  hint: "Opus 4.8 high",
  model: "claude-opus-4-8",
  effort: "high",
});

// Workflow orchestration (the `workflow` trigger word) is only available on
// the Opus models that ship the Workflow tool. Other Claude models (Sonnet,
// Haiku, older Opus) and every other provider leave the word as plain text.
const WORKFLOW_TRIGGER_MODELS = new Set(["claude-opus-4-7", "claude-opus-4-8"]);
registerWorkflowTrigger(
  "claude",
  (model) => model !== undefined && WORKFLOW_TRIGGER_MODELS.has(model),
);

registerComposerControls("claude", ({ capabilities, config, isDisabled, onConfigChange }) => {
  const isPlanMode = (config.mode ?? "agent") !== "agent";

  // Auto mode is only supported for Sonnet 4.6+ and Opus 4.6+.
  // Filter it out for Haiku and other models that don't support it.
  const AUTO_CAPABLE_MODELS = new Set([
    "sonnet",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
  ]);
  const modelSupportsAuto = !config.model || AUTO_CAPABLE_MODELS.has(config.model);
  const filteredPolicies = modelSupportsAuto
    ? capabilities.approvalPolicies
    : capabilities.approvalPolicies.filter((p) => p.id !== "auto");

  const currentPolicy =
    config.approvalPolicy ??
    capabilities.bypassPermissions?.approvalPolicy ??
    capabilities.approvalPolicies[0]?.id ??
    "default";
  // If the current policy is not available for this model, fall back to
  // bypassPermissions since auto mode was the reason it was filtered.
  const effectivePolicy = filteredPolicies.some((p) => p.id === currentPolicy)
    ? currentPolicy
    : "bypassPermissions";

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
    ...(filteredPolicies.length > 0
      ? [
          {
            iconKind: "permission" as const,
            options: filteredPolicies,
            hideLabelOnWrap: true,
            value: effectivePolicy,
            isDisabled,
            onChange: (value: string) => onConfigChange({ approvalPolicy: value }),
          },
        ]
      : []),
  ];
});
