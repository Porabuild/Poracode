export * from "./FactoryIcon";

import { FactoryIcon } from "./FactoryIcon";
import providerManifest from "./manifest";
import { buildAcpComposerControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerComposerControls } from "../providerComposer";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, FactoryIcon);
registerComposerControls(PROVIDER_KIND, buildAcpComposerControls);
registerCommitGenDefaults(PROVIDER_KIND, {
  label: "Droid",
  hint: "auto",
  model: "auto",
  effort: "",
});
registerTitleGenDefaults(PROVIDER_KIND, {
  label: "Droid",
  hint: "auto",
  model: "auto",
  effort: "",
});
registerConflictResolverDefaults(PROVIDER_KIND, {
  label: "Droid",
  hint: "auto",
  model: "auto",
  effort: "",
});
