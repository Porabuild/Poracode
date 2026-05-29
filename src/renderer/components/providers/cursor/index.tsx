export * from "./CursorIcon";

import { CursorIcon } from "./CursorIcon";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { fullAccessToggle, planWorkToggle } from "../composerControlBuilders";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
} from "../ProviderIcon";

registerProviderIcon("cursor", CursorIcon);
registerProviderLabel("cursor", "Cursor");
registerCommitGenDefaults("cursor", {
  label: "Cursor",
  hint: "Composer 2.5",
  model: "composer-2.5",
  effort: "",
});
registerTitleGenDefaults("cursor", {
  label: "Cursor",
  hint: "Composer 2.5",
  model: "composer-2.5",
  effort: "",
});
registerConflictResolverDefaults("cursor", {
  label: "Cursor",
  hint: "Composer 2.5",
  model: "composer-2.5",
  effort: "",
});

registerComposerControls("cursor", ({ capabilities, config, isDisabled, onConfigChange }) => {
  const hasPlanMode = capabilities.modes.includes("plan");
  const isPlanMode = config.mode === "plan";
  const isFullAccess = (config.approvalPolicy ?? "default") === "never";

  const controls: ComposerControl[] = [
    ...(hasPlanMode
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
          fullAccessToggle({
            isFullAccess,
            isDisabled,
            onChange: (isSelected) =>
              onConfigChange({ approvalPolicy: isSelected ? "never" : "default" }),
          }),
        ]
      : []),
  ];

  return controls;
});
