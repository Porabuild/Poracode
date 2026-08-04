export * from "./QoderIcon";

import { QoderIcon } from "./QoderIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;
const QODER_UTILITY_DEFAULTS = {
  label: "Qoder",
  hint: "Auto",
  model: "auto",
  effort: "",
};

registerProviderIcon(PROVIDER_KIND, QoderIcon);
registerCommitGenDefaults(PROVIDER_KIND, QODER_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, QODER_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, QODER_UTILITY_DEFAULTS);

registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));
