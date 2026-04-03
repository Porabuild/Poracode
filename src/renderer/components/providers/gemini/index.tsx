export * from "./GeminiIcon";

import { ClipboardList, ShieldOff } from "lucide-react";
import { GeminiIcon } from "./GeminiIcon";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerProviderIcon,
  registerTitleGenDefaults,
} from "../ProviderIcon";
import { withCurrentModel } from "../../thread/threadComposerOptions";

registerProviderIcon("gemini", GeminiIcon);
registerCommitGenDefaults("gemini", { model: "gemini-2.5-flash", effort: "" });
registerTitleGenDefaults("gemini", { model: "gemini-2.5-flash-lite", effort: "" });

registerComposerControls("gemini", ({ capabilities, config, isDisabled, onConfigChange }) => [
  // Model
  {
    options: withCurrentModel(capabilities.models, config.model),
    value: config.model,
    isDisabled,
    onChange: (value: string) => onConfigChange({ model: value }),
  },
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
  // Approval policy (hidden in plan mode — plan has its own approval semantics)
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
]);
