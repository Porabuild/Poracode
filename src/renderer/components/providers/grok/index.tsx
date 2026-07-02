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
// the lightweight title/commit one-shots; the heavier agentic `grok-build` stays
// for the conflict resolver, which is a real code-editing session.
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
  hint: "Build",
  model: "grok-build",
  effort: "",
});

// Composer surface for Grok: a single Default ↔ Bypass Approvals toggle.
// Plan mode and effort are intentionally absent — neither is driveable from
// launch flags on Grok 0.1.218. See `supervisor/agents/grok/detection.ts`
// and `supervisor/agents/grok/argv.ts` for the rationale.
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
