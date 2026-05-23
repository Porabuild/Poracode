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
  hint: "Opus 4.7 high",
  model: "claude-opus-4-7",
  effort: "high",
});

registerComposerControls("claude", ({ capabilities, config, isDisabled, onConfigChange }) => {
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
          {
            iconKind: "permission" as const,
            options: capabilities.approvalPolicies,
            hideLabelOnWrap: true,
            value:
              config.approvalPolicy ??
              capabilities.bypassPermissions?.approvalPolicy ??
              capabilities.approvalPolicies[0]?.id ??
              "default",
            isDisabled,
            onChange: (value: string) => onConfigChange({ approvalPolicy: value }),
          },
        ]
      : []),
  ];
});
