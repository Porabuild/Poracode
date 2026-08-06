export * from "./GrokIcon";

import { GrokIcon } from "./GrokIcon";
import providerManifest from "./manifest";
import { fullAccessToggle } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, GrokIcon);

// Grok 0.2.118 advertises grok-4.5 as its supported model. Keep utility
// defaults aligned with the live catalog so background generations do not
// fail with an unknown model id.
registerCommitGenDefaults(PROVIDER_KIND, {
  label: "Grok",
  hint: "Grok 4.5",
  model: "grok-4.5",
  effort: "",
});

registerTitleGenDefaults(PROVIDER_KIND, {
  label: "Grok",
  hint: "Grok 4.5",
  model: "grok-4.5",
  effort: "",
});

registerConflictResolverDefaults(PROVIDER_KIND, {
  label: "Grok",
  hint: "Grok 4.5",
  model: "grok-4.5",
  effort: "",
});

// Composer surface for Grok: a single Default ↔ Bypass Approvals toggle.
// Plan mode is intentionally absent — it is not driveable from launch flags
// (re-verified on grok 0.2.118). Effort needs no control here: the shared
// model picker reads `capabilities.modelEfforts` filled by the ACP probe.
// See `supervisor/agents/grok/detection.ts` and `supervisor/agents/grok/argv.ts`.
registerComposerControls(PROVIDER_KIND, ({ capabilities, config, isDisabled, onConfigChange }) => {
  if (!capabilities.approvalPolicies?.length) return [];
  const bypassPolicy = capabilities.bypassPermissions?.approvalPolicy ?? "bypassPermissions";
  const isBypass = config.approvalPolicy === bypassPolicy;
  return [
    fullAccessToggle({
      isFullAccess: isBypass,
      isDisabled,
      onChange: (isSelected) =>
        onConfigChange({ approvalPolicy: isSelected ? bypassPolicy : "default" }),
    }),
  ];
});
