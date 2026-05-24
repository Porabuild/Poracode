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

registerCommitGenDefaults("grok", {
  label: "Grok",
  hint: "Build",
  model: "grok-build",
  effort: "",
});

registerTitleGenDefaults("grok", {
  label: "Grok",
  hint: "Build",
  model: "grok-build",
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
