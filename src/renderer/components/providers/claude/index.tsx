export * from "./ClaudeIcon";

import { ClipboardList, ShieldOff, Sparkles } from "lucide-react";
import { ClaudeIcon } from "./ClaudeIcon";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerTitleGenDefaults,
} from "../ProviderIcon";
import { withCurrentModel } from "../../thread/threadComposerOptions";

registerProviderIcon("claude", ClaudeIcon);
registerCommitGenDefaults("claude", { model: "haiku", effort: "" });
registerTitleGenDefaults("claude", { model: "haiku", effort: "" });
registerConflictResolverDefaults("claude", { model: "claude-opus-4-6[1m]", effort: "" });

registerComposerControls("claude", ({ capabilities, config, isDisabled, onConfigChange }) => {
  const availableEfforts =
    capabilities.modelEfforts?.[config.model ?? ""] ?? capabilities.efforts ?? [];

  return [
    // Model
    {
      options: withCurrentModel(capabilities.models, config.model),
      value: config.model,
      isDisabled,
      onChange: (value: string) => {
        const nextEfforts = capabilities.modelEfforts?.[value] ?? capabilities.efforts ?? [];
        const effortValid = nextEfforts.includes(config.effort ?? "");
        onConfigChange({
          model: value,
          ...(!effortValid && nextEfforts.length > 0 ? { effort: nextEfforts[0] } : {}),
        });
      },
    },
    // Effort
    ...(availableEfforts.length > 0
      ? [
          {
            icon: <Sparkles className="size-4 text-muted" />,
            options: availableEfforts.map((value) => ({
              id: value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            })),
            value: config.effort ?? availableEfforts[0] ?? "",
            isDisabled,
            onChange: (value: string) => onConfigChange({ effort: value }),
          },
        ]
      : []),
    // Plan toggle
    ...(capabilities.modes.length === 2
      ? [
          {
            kind: "toggle" as const,
            icon: <ClipboardList className="size-3.5" />,
            label: "Plan",
            hideLabelOnWrap: true,
            isSelected: (config.mode ?? "agent") !== "agent",
            isDisabled,
            onChange: (isSelected: boolean) =>
              onConfigChange({ mode: isSelected ? "plan" : "agent" }),
          },
        ]
      : []),
    // Approval policy (hidden when plan mode overrides it)
    ...(capabilities.approvalPolicies.length > 0 && (config.mode ?? "agent") === "agent"
      ? [
          {
            icon: <ShieldOff className="size-3.5" />,
            options: capabilities.approvalPolicies,
            hideLabelOnWrap: true,
            value: config.approvalPolicy ?? capabilities.approvalPolicies[0]?.id ?? "default",
            isDisabled,
            onChange: (value: string) => onConfigChange({ approvalPolicy: value }),
          },
        ]
      : []),
  ];
});
