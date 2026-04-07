export * from "./CopilotIcon";

import { ClipboardList, ShieldOff, Sparkles } from "lucide-react";
import { CopilotIcon } from "./CopilotIcon";
import type { ComposerControl } from "../../thread/ThreadComposer";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerTitleGenDefaults,
} from "../ProviderIcon";
import { withCurrentModel } from "../../thread/threadComposerOptions";

/**
 * Hardcoded premium request cost multipliers for Copilot models.
 * Source: GitHub Copilot pricing docs. Key = substring matched against model id.
 * Update when GitHub changes pricing.
 */
const COPILOT_MODEL_COSTS: Array<{ pattern: string; cost: string }> = [
  { pattern: "claude-sonnet", cost: "1x" },
  { pattern: "claude-haiku", cost: "0.33x" },
  { pattern: "claude-opus", cost: "3x" },
  { pattern: "gpt-5.4", cost: "1x" },
  { pattern: "gpt-5.3-codex", cost: "1x" },
  { pattern: "gpt-5.2-codex", cost: "1x" },
  { pattern: "gpt-5.2", cost: "1x" },
  { pattern: "gpt-5-mini", cost: "0x" },
  { pattern: "gpt-5 mini", cost: "0x" },
  { pattern: "gpt-4.1", cost: "0x" },
];

function findCopilotModelCost(id: string, label?: string): string | undefined {
  const lowerId = id.toLowerCase();
  const lowerLabel = label?.toLowerCase() ?? "";
  for (const { pattern, cost } of COPILOT_MODEL_COSTS) {
    if (lowerId.includes(pattern) || lowerLabel.includes(pattern)) return cost;
  }
  return undefined;
}

registerProviderIcon("copilot", CopilotIcon);
registerCommitGenDefaults("copilot", {
  label: "Copilot",
  hint: "first available model",
  model: "",
  effort: "low",
});
registerTitleGenDefaults("copilot", {
  label: "Copilot",
  hint: "first available model",
  model: "",
  effort: "low",
});
registerConflictResolverDefaults("copilot", {
  label: "Copilot",
  hint: "first available model",
  model: "",
  effort: "",
});

registerComposerControls("copilot", ({ capabilities, config, isDisabled, onConfigChange }) => {
  const availableEfforts =
    capabilities.modelEfforts?.[config.model ?? ""] ?? capabilities.efforts ?? [];
  const hasPlanMode = capabilities.modes.includes("plan");

  const controls: ComposerControl[] = [
    {
      options: withCurrentModel(capabilities.models, config.model).map((m) => {
        const cost = findCopilotModelCost(m.id, m.label);
        return cost ? { ...m, hint: cost } : m;
      }),
      value: config.model,
      isDisabled,
      onChange: (value: string) => {
        const nextEfforts = capabilities.modelEfforts?.[value] ?? capabilities.efforts ?? [];
        onConfigChange({
          model: value,
          ...(nextEfforts.length > 0
            ? { effort: capabilities.defaultEffort ?? nextEfforts[0] }
            : {}),
        });
      },
    },
    ...(availableEfforts.length > 0
      ? [
          {
            icon: <Sparkles className="size-4 text-muted" />,
            options: availableEfforts.map((value) => ({
              id: value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            })),
            value: config.effort ?? capabilities.defaultEffort ?? availableEfforts[0] ?? "",
            hideLabelOnWrap: true,
            isDisabled,
            onChange: (value: string) => onConfigChange({ effort: value }),
          },
        ]
      : []),
    ...(hasPlanMode
      ? [
          {
            kind: "toggle" as const,
            label: "Plan",
            icon: <ClipboardList className="size-3.5" />,
            isSelected: config.mode === "plan",
            hideLabelOnWrap: true,
            isDisabled,
            onChange: (isSelected: boolean) =>
              onConfigChange({ mode: isSelected ? "plan" : "agent" }),
          },
        ]
      : []),
    {
      kind: "toggle" as const,
      label: "Bypass Approvals",
      icon: <ShieldOff className="size-3.5" />,
      isSelected: (config.approvalPolicy ?? "never") === "never",
      hideLabelOnWrap: true,
      isDisabled,
      onChange: (isSelected: boolean) =>
        onConfigChange({ approvalPolicy: isSelected ? "never" : "default" }),
    },
  ];

  return controls;
});
