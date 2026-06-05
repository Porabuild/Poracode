import type { AgentCapability } from "@/shared/contracts";
import { type AuthProbe, type DetectionSpec } from "../base";
import {
  ANTIGRAVITY_KNOWN_MODEL_VARIANTS,
  buildAntigravityModelCapabilities,
  probeAntigravityModels,
} from "./models";
import { antigravityConfigDirExists } from "./session";

export const ANTIGRAVITY_DEFAULT_MODEL_ID = "Gemini 3.5 Flash";

const defaultModelCapabilities = buildAntigravityModelCapabilities(
  ANTIGRAVITY_KNOWN_MODEL_VARIANTS,
);

export const defaultAntigravityCapabilities: AgentCapability = {
  models: defaultModelCapabilities.models,
  efforts: defaultModelCapabilities.efforts,
  defaultEffort: defaultModelCapabilities.defaultEffort,
  modelEfforts: defaultModelCapabilities.modelEfforts,
  modes: [],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  settingDefs: [],
};

// `agy` keeps its config under `~/.gemini/antigravity-cli/`; the real
// credential lives in the OS keyring and isn't directly probeable, so the
// subdir's presence is the best proxy we have for "first-run has completed".
// This is a soft signal — the keyring may still be unauthenticated even when
// the dir exists.
const configDirAuthProbe: AuthProbe = async (ctx) => {
  return antigravityConfigDirExists(ctx.location) ? "authenticated" : "unknown";
};

export const antigravityDetectionSpec: DetectionSpec = {
  kind: "antigravity",
  label: "Antigravity",
  binary: "agy",
  capabilities: defaultAntigravityCapabilities,
  authProbes: [configDirAuthProbe],
  async capabilitiesProbe(ctx) {
    return await probeAntigravityModels(ctx);
  },
  update: {
    builtIn: { binary: "agy", args: ["update"] },
    latestVersionUrls: [
      "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
    ],
  },
};
