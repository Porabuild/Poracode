export * from "./AntigravityIcon";

import { AntigravityIcon } from "./AntigravityIcon";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerProviderLabel,
  registerTitleGenDefaults,
} from "../ProviderIcon";

registerProviderIcon("antigravity", AntigravityIcon);
registerProviderLabel("antigravity", "Antigravity");

// Antigravity runs the same Google models as the Gemini provider, expressed
// through its per-variant effort suffix (Low/Medium/High). A local benchmark
// (latency + type-correctness over real diffs) confirmed: Flash at Low effort is
// fastest and ties on title quality (titles saturate); Flash at Medium is the
// only Flash/Pro config that types BOTH a fix and a feat commit correctly (Low
// mislabels the fix, Pro mislabels the feat and is ~2-3x slower); Pro stays for
// the heavier conflict resolver. Without these, Antigravity fell through to its
// first listed model for every task — leaving the conflict resolver on weak Flash.
registerTitleGenDefaults("antigravity", {
  label: "Antigravity",
  hint: "Gemini 3.5 Flash Low",
  model: "Gemini 3.5 Flash",
  effort: "Low",
});
registerCommitGenDefaults("antigravity", {
  label: "Antigravity",
  hint: "Gemini 3.5 Flash Medium",
  model: "Gemini 3.5 Flash",
  effort: "Medium",
});
registerConflictResolverDefaults("antigravity", {
  label: "Antigravity",
  hint: "Gemini 3.1 Pro High",
  model: "Gemini 3.1 Pro",
  effort: "High",
});

registerComposerControls("antigravity", (input) => standardPlanApprovalControls(input));
