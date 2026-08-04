export * from "./QwenIcon";

import { msg } from "@lingui/core/macro";
import { QwenIcon } from "./QwenIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;
const QWEN_UTILITY_DEFAULTS = {
  label: "Qwen",
  hint: "3.8 Max Preview",
  model: "qwen3.8-max-preview",
  effort: "",
};

registerProviderIcon(PROVIDER_KIND, QwenIcon);
registerCommitGenDefaults(PROVIDER_KIND, QWEN_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, QWEN_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, QWEN_UTILITY_DEFAULTS);

registerComposerControls(PROVIDER_KIND, (input) =>
  standardPlanApprovalControls(input).map((control) =>
    "iconKind" in control && control.iconKind === "mode" && input.config.mode !== "plan"
      ? { ...control, label: "Task", displayLabel: msg`Task` }
      : control,
  ),
);
