export * from "./OpenCodeIcon";

import { OpenCodeIcon } from "./OpenCodeIcon";
import providerManifest from "./manifest";
import { fullAccessToggle, planWorkToggle } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

// Available in a fresh installation without a configured paid upstream account.
const OPENCODE_DEFAULT_MODEL = "opencode/big-pickle";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, OpenCodeIcon);
const liveDefaults = {
  label: "OpenCode",
  hint: "Big Pickle",
  model: OPENCODE_DEFAULT_MODEL,
  effort: "",
};
registerCommitGenDefaults(PROVIDER_KIND, liveDefaults);
registerTitleGenDefaults(PROVIDER_KIND, liveDefaults);
registerConflictResolverDefaults(PROVIDER_KIND, liveDefaults);

registerComposerControls(PROVIDER_KIND, {
  // Both surfaces configure the native session before admitting a prompt.
  shared: ({ capabilities, config, isDisabled, onConfigChange }) => [
    ...(capabilities.modes.includes("plan")
      ? [
          planWorkToggle({
            isPlanMode: config.mode === "plan",
            isDisabled,
            onChange: (isSelected) => onConfigChange({ mode: isSelected ? "plan" : "agent" }),
          }),
        ]
      : []),
    fullAccessToggle({
      isFullAccess: config.approvalPolicy === "yolo",
      isDisabled,
      onChange: (isSelected) => onConfigChange({ approvalPolicy: isSelected ? "yolo" : "default" }),
    }),
  ],
});
