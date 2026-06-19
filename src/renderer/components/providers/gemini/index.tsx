export * from "./GeminiIcon";

import { GeminiIcon } from "./GeminiIcon";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
} from "../ProviderIcon";

registerProviderIcon("gemini", GeminiIcon);
registerProviderLabel("gemini", "Gemini");
registerCommitGenDefaults("gemini", {
  label: "Gemini",
  hint: "3 Flash",
  model: "gemini-3-flash",
  effort: "",
});
registerTitleGenDefaults("gemini", {
  label: "Gemini",
  hint: "3.1 Flash Lite",
  model: "gemini-3.1-flash-lite",
  effort: "",
});
registerConflictResolverDefaults("gemini", {
  label: "Gemini",
  hint: "3.1 Pro",
  model: "gemini-3.1-pro",
  effort: "",
});

registerComposerControls("gemini", (input) => standardPlanApprovalControls(input));
