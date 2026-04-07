export * from "./CursorIcon";

import { ClipboardList, ShieldOff } from "lucide-react";
import { CursorIcon } from "./CursorIcon";
import type { ComposerControl } from "../../thread/ThreadComposer";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerTitleGenDefaults,
} from "../ProviderIcon";
import { withCurrentModel } from "../../thread/threadComposerOptions";

registerProviderIcon("cursor", CursorIcon);
registerCommitGenDefaults("cursor", {
  label: "Cursor",
  hint: "Composer 2 Fast",
  model: "composer-2-fast",
  effort: "",
});
registerTitleGenDefaults("cursor", {
  label: "Cursor",
  hint: "Composer 2 Fast",
  model: "composer-2-fast",
  effort: "",
});
registerConflictResolverDefaults("cursor", {
  label: "Cursor",
  hint: "Auto",
  model: "auto",
  effort: "",
});

registerComposerControls("cursor", ({ capabilities, config, isDisabled, onConfigChange }) => {
  const hasPlanMode = capabilities.modes.includes("plan");

  const controls: ComposerControl[] = [
    {
      options: withCurrentModel(capabilities.models, config.model),
      value: config.model,
      isDisabled,
      onChange: (value: string) => onConfigChange({ model: value }),
    },
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
    ...(capabilities.approvalPolicies.length > 0
      ? [
          {
            kind: "toggle" as const,
            label: "YOLO",
            icon: <ShieldOff className="size-3.5" />,
            isSelected: (config.approvalPolicy ?? "default") === "never",
            hideLabelOnWrap: true,
            isDisabled,
            onChange: (isSelected: boolean) =>
              onConfigChange({ approvalPolicy: isSelected ? "never" : "default" }),
          },
        ]
      : []),
  ];

  return controls;
});
