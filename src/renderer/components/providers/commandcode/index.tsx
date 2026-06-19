export * from "./CommandCodeIcon";

import { CommandCodeIcon } from "./CommandCodeIcon";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
} from "../ProviderIcon";

registerProviderIcon("commandcode", CommandCodeIcon);
registerProviderLabel("commandcode", "Command Code");
registerCommitGenDefaults("commandcode", {
  label: "Command Code",
  hint: "GPT-5.4 Mini",
  model: "gpt-5.4-mini",
  effort: "",
});
registerTitleGenDefaults("commandcode", {
  label: "Command Code",
  hint: "Gemini 3.1 Flash Lite",
  model: "google/gemini-3.1-flash-lite",
  effort: "",
});
registerConflictResolverDefaults("commandcode", {
  label: "Command Code",
  hint: "Claude Sonnet 4.6",
  model: "claude-sonnet-4-6",
  effort: "",
});

registerComposerControls("commandcode", (input) => standardPlanApprovalControls(input));
