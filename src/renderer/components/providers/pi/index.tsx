export * from "./PiIcon";

import { PiIcon } from "./PiIcon";
import providerManifest from "./manifest";
import { registerProviderIcon } from "../ProviderIcon";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerComposerControls } from "../providerComposer";
import { registerTitleGenDefaults } from "../titleGen";

// Pi intentionally has no core plan mode or permission policy. Model and
// thinking controls come from the dynamically detected capabilities; optional
// extension commands are published by the live SDK session.
registerProviderIcon(providerManifest.kind, PiIcon);
// Pi has no universal model: its catalog is the authenticated providers in the
// user's ModelRegistry. Empty defaults intentionally select the first detected
// model at runtime instead of advertising a model that may not be configured.
const utilityDefaults = { label: "Pi", model: "", effort: "" };
registerCommitGenDefaults(providerManifest.kind, utilityDefaults);
registerTitleGenDefaults(providerManifest.kind, utilityDefaults);
registerConflictResolverDefaults(providerManifest.kind, utilityDefaults);
registerComposerControls(providerManifest.kind, () => []);
