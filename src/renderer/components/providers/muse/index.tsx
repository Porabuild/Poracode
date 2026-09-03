export * from "./MuseIcon";

import { MuseIcon } from "./MuseIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, MuseIcon);

// Utility defaults for one-shot title/commit generation and full conflict-
// resolution threads. Muse's one-shot path passes the prompt positionally to
// `muse exec` because that command does not consume prompts from stdin.
const MUSE_UTILITY_DEFAULTS = {
  label: "Muse Code",
  hint: "Muse Spark 1.3",
  model: "muse-spark-1.3",
  effort: "high",
};

registerCommitGenDefaults(PROVIDER_KIND, MUSE_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, MUSE_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, MUSE_UTILITY_DEFAULTS);

// Terminal-only provider (no ACP; GUI deferred until Muse ships one) — the
// TUI can prompt for approvals, so it gets the full policy selector. Effort
// selector is driven by capabilities.efforts in the shared model picker — no
// provider-specific registration needed. No plan mode (modes: ["agent"] only).
registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));
