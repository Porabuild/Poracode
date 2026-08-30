export * from "./AntigravityIcon";

import { msg } from "@lingui/core/macro";
import { AntigravityIcon } from "./AntigravityIcon";
import providerManifest from "./manifest";
import { ANTIGRAVITY_ACP_REGISTRY_ID } from "@/shared/agents/antigravity";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import {
  registerCombinedRuntimeUpdates,
  registerComposerControls,
  registerConfigNormalizer,
} from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, AntigravityIcon);
registerCombinedRuntimeUpdates(PROVIDER_KIND, ({ agentStatus }) => {
  const cli = agentStatus.runtimeVariants?.cli;
  const acp = agentStatus.runtimeVariants?.acp;
  return [
    {
      id: "cli",
      label: msg`agy CLI`,
      installed: cli?.installed === true,
      ...(cli?.version ? { installedVersion: cli.version } : {}),
      channel: { kind: "agent-binary" },
    },
    {
      id: "acp",
      label: msg`Antigravity ACP`,
      installed: acp?.installed === true,
      ...(acp?.version ? { installedVersion: acp.version } : {}),
      channel: { kind: "acp-registry", agentId: ANTIGRAVITY_ACP_REGISTRY_ID },
    },
  ];
});

// Antigravity runs the same Google models as the Gemini provider, expressed
// through its per-variant effort suffix (Low/Medium/High). A local benchmark
// (latency + type-correctness over real diffs) confirmed: Flash at Low effort is
// fastest and ties on title quality (titles saturate); Flash at Medium is the
// only Flash/Pro config that types BOTH a fix and a feat commit correctly (Low
// mislabels the fix, Pro mislabels the feat and is ~2-3x slower); Pro stays for
// the heavier conflict resolver. Without these, Antigravity fell through to its
// first listed model for every task — leaving the conflict resolver on weak Flash.
registerTitleGenDefaults(PROVIDER_KIND, {
  label: "Antigravity",
  hint: "Gemini 3.5 Flash Low",
  model: "Gemini 3.5 Flash",
  effort: "Low",
});
registerCommitGenDefaults(PROVIDER_KIND, {
  label: "Antigravity",
  hint: "Gemini 3.5 Flash Medium",
  model: "Gemini 3.5 Flash",
  effort: "Medium",
});
registerConflictResolverDefaults(PROVIDER_KIND, {
  label: "Antigravity",
  hint: "Gemini 3.1 Pro High",
  model: "Gemini 3.1 Pro",
  effort: "High",
});

registerComposerControls(PROVIDER_KIND, (input) => standardPlanApprovalControls(input));
registerConfigNormalizer(PROVIDER_KIND, ({ capabilities, config }) => {
  const policyIds = capabilities.approvalPolicies.map((policy) => policy.id);
  if (policyIds.length === 0) return {};
  const equivalentPolicy =
    config.approvalPolicy === "yolo" && policyIds.includes("never")
      ? "never"
      : config.approvalPolicy === "never" && policyIds.includes("yolo")
        ? "yolo"
        : config.approvalPolicy;
  const approvalPolicy =
    equivalentPolicy && policyIds.includes(equivalentPolicy)
      ? equivalentPolicy
      : capabilities.defaultApprovalPolicy && policyIds.includes(capabilities.defaultApprovalPolicy)
        ? capabilities.defaultApprovalPolicy
        : policyIds[0]!;
  return approvalPolicy === config.approvalPolicy ? {} : { approvalPolicy };
});
