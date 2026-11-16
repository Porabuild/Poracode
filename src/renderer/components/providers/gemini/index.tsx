export * from "./GeminiIcon";

import { GeminiIcon } from "./GeminiIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, GeminiIcon);
registerCommitGenDefaults(PROVIDER_KIND, {
  label: "Gemini",
  hint: "3 Flash",
  model: "gemini-3-flash",
  effort: "",
});
registerTitleGenDefaults(PROVIDER_KIND, {
  label: "Gemini",
  hint: "3.1 Flash Lite",
  model: "gemini-3.1-flash-lite",
  effort: "",
});
registerConflictResolverDefaults(PROVIDER_KIND, {
  label: "Gemini",
  hint: "3.1 Pro",
  model: "gemini-3.1-pro-preview",
  effort: "",
});

registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));
