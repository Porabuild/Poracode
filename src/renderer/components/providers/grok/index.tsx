export * from "./GrokIcon";

import { GrokIcon } from "./GrokIcon";
import { fullAccessToggle } from "../composerControlBuilders";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
} from "../ProviderIcon";

registerProviderIcon("grok", GrokIcon);
registerProviderLabel("grok", "Grok Build");

// Grok has two models, both covered by the subscription (no per-token cost), so
// pick by fit: `grok-composer-2.5-fast` is Grok's own default — fast, ideal for
// the lightweight title/commit one-shots; the frontier `grok-4.5` takes the
// conflict resolver, which is a real code-editing session. (The old `grok-build`
// model id was retired upstream — the 0.2.x catalog is grok-4.5 +
// grok-composer-2.5-fast.)
registerCommitGenDefaults("grok", {
  label: "Grok",
  hint: "Composer 2.5 Fast",
  model: "grok-composer-2.5-fast",
  effort: "",
});

registerTitleGenDefaults("grok", {
  label: "Grok",
  hint: "Composer 2.5 Fast",
  model: "grok-composer-2.5-fast",
  effort: "",
});

registerConflictResolverDefaults("grok", {
  label: "Grok",
  hint: "Grok 4.5",
  model: "grok-4.5",
  effort: "",
});

// Composer surface for Grok: a single Default ↔ Bypass Approvals toggle.
// Plan mode is intentionally absent — it is not driveable from launch flags
// (re-verified on grok 0.2.93). Effort needs no control here: the shared
// model picker reads `capabilities.modelEfforts` filled by the ACP probe.
// See `supervisor/agents/grok/detection.ts` and `supervisor/agents/grok/argv.ts`.
registerComposerControls("grok", ({ capabilities, config, isDisabled, onConfigChange }) => {
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
