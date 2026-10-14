export * from "./CommandCodeIcon";

import { CommandCodeIcon } from "./CommandCodeIcon";
import providerManifest from "./manifest";
import { normalizeCommandCodeConfig } from "./config";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls, registerConfigNormalizer } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, CommandCodeIcon);
const liveDefaults = { label: "Command Code", model: "", effort: "" };
registerCommitGenDefaults(PROVIDER_KIND, liveDefaults);
registerTitleGenDefaults(PROVIDER_KIND, liveDefaults);
registerConflictResolverDefaults(PROVIDER_KIND, liveDefaults);
registerConfigNormalizer(PROVIDER_KIND, normalizeCommandCodeConfig);
registerComposerControls(PROVIDER_KIND, (input) =>
  standardPlanApprovalControls({
    ...input,
    config: { ...input.config, ...normalizeCommandCodeConfig(input) },
  }),
);
