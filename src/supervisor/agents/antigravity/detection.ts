import type { AgentCapability } from "@/shared/contracts";
import { type AuthProbe, type DetectionSpec } from "../base";
import { antigravityConfigDirExists } from "./session";

// `agy` does not accept `--model` and chooses a model internally based on
// the logged-in Google account. Surface Auto so the model picker has a
// required config value; the launch path ignores the selection.
export const ANTIGRAVITY_MANAGED_MODEL_ID = "auto";

export const defaultAntigravityCapabilities: AgentCapability = {
  models: [
    {
      id: ANTIGRAVITY_MANAGED_MODEL_ID,
      label: "Auto",
      description: "Model selected by agy from the signed-in account",
    },
  ],
  efforts: [],
  modelEfforts: {},
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
  update: {
    builtIn: { binary: "agy", args: ["update"] },
    latestVersionUrls: [
      "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
    ],
  },
};
