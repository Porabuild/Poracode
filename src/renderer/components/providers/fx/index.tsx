export * from "./FxIcon";

import { FxIcon } from "./FxIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;
const FX_UTILITY_DEFAULTS = {
  label: "fx",
  model: "",
  effort: "",
};

registerProviderIcon(PROVIDER_KIND, FxIcon);
registerCommitGenDefaults(PROVIDER_KIND, FX_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, FX_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, FX_UTILITY_DEFAULTS);

registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));
