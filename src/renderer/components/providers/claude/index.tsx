export * from "./ClaudeIcon";

import { ClaudeIcon } from "./ClaudeIcon";
import providerManifest from "./manifest";
import { approvalPolicyDropdown, planWorkToggle } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, ClaudeIcon);
// Benchmark-driven (blind quality judging over real diffs): Sonnet at MEDIUM
// effort is the sweet spot. At low/high effort Sonnet sometimes mislabels the
// commit type (e.g. a fix scored as "test") and emits markdown fences; medium
// fixed both and scored highest among Sonnet tiers, while high added latency for
// no gain. Opus stays reserved for the conflict resolver below.
registerCommitGenDefaults(PROVIDER_KIND, {
  label: "Claude",
  hint: "Sonnet medium",
  model: "sonnet",
  effort: "medium",
});
// Haiku exposes no effort tiers (the value below is a no-op the resolver drops);
// it is already the fastest Claude model, ideal for trivial title generation.
registerTitleGenDefaults(PROVIDER_KIND, {
  label: "Claude",
  hint: "Haiku",
  model: "haiku",
  effort: "low",
});
registerConflictResolverDefaults(PROVIDER_KIND, {
  label: "Claude",
  hint: "Opus 4.8 high",
  model: "claude-opus-4-8",
  effort: "high",
});

// Auto mode is only supported for Sonnet 4.6+ and Opus 4.6+.
// Filter it out for Haiku and other models that don't support it.
const AUTO_CAPABLE_MODELS = new Set([
  "sonnet",
  "claude-opus-5",
  "claude-fable-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
]);

registerComposerControls(PROVIDER_KIND, ({ capabilities, config, isDisabled, onConfigChange }) => {
  const isPlanMode = (config.mode ?? "agent") !== "agent";

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
          approvalPolicyDropdown({
            policies: filteredPolicies,
            currentPolicy: effectivePolicy,
            isDisabled,
            onChange: (value) => onConfigChange({ approvalPolicy: value }),
          }),
        ]
      : []),
  ];
});
