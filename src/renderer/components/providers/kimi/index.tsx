export * from "./KimiIcon";

import { KimiIcon } from "./KimiIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, KimiIcon);

// Use Kimi's standard managed coding model for utility one-shots and conflict
// resolution. Unlike HighSpeed, it is available to every Kimi Code member.
const KIMI_UTILITY_DEFAULTS = {
  label: "Kimi Code",
  hint: "K2.7 Coding",
  model: "kimi-code/kimi-for-coding",
  effort: "",
};

registerCommitGenDefaults(PROVIDER_KIND, KIMI_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, KIMI_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, KIMI_UTILITY_DEFAULTS);

// Kimi exposes Default, Auto, and YOLO as distinct ACP permission modes, so
// keep the full approval menu alongside the capability-driven Plan/Work toggle.
registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));
