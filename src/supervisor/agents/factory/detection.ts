import type { AgentCapability, ProjectLocation } from "@/shared/contracts";
import { dedupeAcpAuthMethods, probeAcpCapabilities, type AcpProbeResult } from "../acp";
import {
  buildAgentCommand,
  envVarAuthProbe,
  mergeSpawnEnv,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";

export const FACTORY_ACP_ARGS = ["exec", "--output-format", "acp"] as const;

export const FACTORY_DISABLE_AUTO_UPDATE_ENV: Record<string, string> = {
  DROID_DISABLE_AUTO_UPDATE: "true",
  FACTORY_DROID_AUTO_UPDATE_ENABLED: "false",
};

export const factoryDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [
    { id: "normal", label: "Auto (Off)" },
    { id: "spec", label: "Spec Mode" },
    { id: "auto-low", label: "Auto (Low Risk)" },
    { id: "auto-medium", label: "Auto (Medium Risk)" },
    { id: "auto-high", label: "Auto (High Risk)" },
  ],
  sandboxModes: [],
  defaultApprovalPolicy: "auto-high",
  bypassPermissions: { approvalPolicy: "auto-high" },
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  settingDefs: [],
};

// The session/auth command builder keeps the env baked in even though the same
// map rides `baseSpawnEnv`: these commands are also the WSL lane, where env
// must be exported inside the wsl.exe login-shell script (spawn-level env does
// not reliably cross into the distro). `buildAgentCommand` does that baking —
// and it is the SAME constant as `factoryDetectionSpec.baseSpawnEnv`, so the
// shared merge at the ACP session/auth lanes is idempotent, never a drift.
//
// `extraEnv` layers ON TOP of that constant rather than replacing it, so a
// caller forwarding a narrower env (e.g. a probe-only overlay) can never drop
// the updater opt-out out of the WSL script.
export function buildFactoryCommand(
  location: ProjectLocation,
  executablePath?: string,
  extraEnv?: Record<string, string>,
) {
  return buildAgentCommand(
    location,
    "droid",
    [...FACTORY_ACP_ARGS],
    executablePath,
    mergeSpawnEnv(FACTORY_DISABLE_AUTO_UPDATE_ENV, extraEnv),
  );
}

export function normalizeFactoryModels(
  models: NonNullable<AcpProbeResult["models"]>,
): NonNullable<AcpProbeResult["models"]> {
  return models.map((model) => {
    const rawDescription = model.description;
    const match = /^(\d+(?:\.\d+)?)x\b.*\bFactory token rate\b/iu.exec(
      rawDescription?.trim() ?? "",
    );
    return match?.[1] && rawDescription
      ? { ...model, description: `${match[1]}x`, tooltipDescription: rawDescription }
      : model;
  });
}

export function buildFactoryProbeCapabilities(probe: AcpProbeResult): CapabilitiesProbeResult {
  const authMethods = probe.authMethods?.length
    ? dedupeAcpAuthMethods(probe.authMethods)
    : undefined;
  return {
    ...factoryDefaultCapabilities,
    ...(probe.models?.length ? { models: normalizeFactoryModels(probe.models) } : {}),
    ...(probe.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe.modelDefaultEfforts ? { modelDefaultEfforts: probe.modelDefaultEfforts } : {}),
    ...(probe.thinkingModels ? { thinkingModels: probe.thinkingModels } : {}),
    ...(probe.modes?.length ? { modes: probe.modes } : {}),
    ...(probe.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    ...(authMethods?.length ? { authMethods } : {}),
    ...(probe.authLogoutSupported ? { authLogoutSupported: true } : {}),
    ...(probe.authState ? { authState: probe.authState } : {}),
  };
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath: string,
  probeEnv: Record<string, string> | undefined,
  signal?: AbortSignal,
): Promise<CapabilitiesProbeResult | undefined> {
  // Env comes from the shared merge (`detectAgentInstall` passes
  // `baseSpawnEnv`+`probeEnv` as ctx.probeEnv) — the probe lane honors the
  // single declaration point; `buildFactoryCommand` bakes it into the WSL script.
  const command = buildFactoryCommand(location, executablePath, probeEnv);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  const probe = await probeAcpCapabilities(
    command.command,
    command.args,
    getAgentProbeCwd(location),
    {
      ...(processCwd ? { processCwd } : {}),
      ...(command.env ? { env: command.env } : {}),
      timeoutMs: 30_000,
      ...(signal ? { signal } : {}),
      label:
        location.kind === "wsl" ? `factory:wsl:${location.distro}` : `factory:${location.kind}`,
    },
  );
  return probe ? buildFactoryProbeCapabilities(probe) : undefined;
}

export const factoryDetectionSpec: DetectionSpec = {
  kind: "factory",
  label: "Factory Droid",
  binary: "droid",
  capabilities: factoryDefaultCapabilities,
  update: {
    builtIn: { binary: "droid", args: ["update"] },
    npm: "droid",
  },
  baseSpawnEnv: FACTORY_DISABLE_AUTO_UPDATE_ENV,
  authProbes: [envVarAuthProbe(["FACTORY_API_KEY"])],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath, ctx.probeEnv, ctx.signal);
  },
};
