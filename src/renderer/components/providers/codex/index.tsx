export * from "./CodexStatusIcon";

import { ClipboardList, ShieldOff, Sparkles } from "lucide-react";
import { CodexStatusIcon } from "./CodexStatusIcon";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerProviderIcon,
  registerTitleGenDefaults,
} from "../ProviderIcon";
import { withCurrentModel } from "../../thread/threadComposerOptions";

registerProviderIcon("codex", CodexStatusIcon);
registerCommitGenDefaults("codex", { model: "gpt-5.4-mini", effort: "low" });
registerTitleGenDefaults("codex", { model: "gpt-5.4-mini", effort: "low" });

registerComposerControls("codex", ({ capabilities, config, isDisabled, onConfigChange }) => {
  const availableEfforts =
    capabilities.modelEfforts?.[config.model ?? ""] ?? capabilities.efforts ?? [];
  const hasPermissions =
    capabilities.approvalPolicies.length > 0 || capabilities.sandboxModes.length > 0;
  const isFullAccess =
    config.approvalPolicy === "never" && config.sandboxMode === "danger-full-access";

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
    // Approval/sandbox — Full Access toggle (Codex couples both fields)
    ...(hasPermissions
      ? [
          {
            kind: "toggle" as const,
            icon: <ShieldOff className="size-3.5" />,
            label: "Full Access",
            hideLabelOnWrap: true,
            isSelected: isFullAccess,
            isDisabled,
            onChange: (selected: boolean) => {
              if (selected) {
                onConfigChange({
                  approvalPolicy: "never",
                  sandboxMode: "danger-full-access",
                });
              } else {
                onConfigChange({
                  approvalPolicy: capabilities.approvalPolicies[0]?.id,
                  sandboxMode: capabilities.sandboxModes[0]?.id,
                });
              }
            },
          },
        ]
      : []),
  ];
});
