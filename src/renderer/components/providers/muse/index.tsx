export * from "./MuseIcon";

import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { MuseIcon } from "./MuseIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";
import { registerGuiSlashCommands } from "../providerSlashCommands";
import {
  buildStandardGuiSlashCommands,
  guiSlashCommand,
  resolveStandardLocalSlashAction,
} from "../standardGuiSlashCommands";

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

// Muse Code supports both Terminal (TUI) and Chat (GUI backed by Muse Session
// Protocol `muse serve`). Effort selector is driven by capabilities.efforts
// in the shared model picker. No plan mode (modes: ["agent"] only).
registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));

// `/compact` is the only Muse TUI built-in the session protocol exposes to a
// GUI thread. The other built-ins (`/goal`, `/fork`, `/status`, `/usage`,
// `/theme`, …) are deliberately absent: MSP has no command-listing method, so
// there is nothing to discover, and no goal API in `muse serve` sessions
// (`create_goal` is not offered as a tool), so `/goal` cannot work here.
// Skills are a separate surface, enumerated by `muse skills list`.
registerGuiSlashCommands(PROVIDER_KIND, {
  // Muse has no plan/agent/fast modes, so filter those out after building.
  buildCommands: (ctx) =>
    buildStandardGuiSlashCommands(ctx, [
      // `/compact` has no local action: it submits to the provider, which
      // answers it with `session/compact`.
      guiSlashCommand("compact", i18n._(msg`Compact the conversation context`)),
    ]).filter(
      (command) => command.id !== "plan" && command.id !== "agent" && command.id !== "fast",
    ),
  resolveLocalAction: (typed) => {
    const action = resolveStandardLocalSlashAction(typed);
    if (action?.kind === "set-mode" || action?.kind === "toggle-fast") return null;
    return action;
  },
});
