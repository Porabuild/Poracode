import type { AgentCapability, ProjectLocation } from "@/shared/contracts";
import { dedupeAcpAuthMethods, probeAcpCapabilities, type AcpProbeResult } from "../acp";
import {
  buildAgentCommand,
  envVarAuthProbe,
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
  defaultApprovalPolicy: "normal",
  bypassPermissions: { approvalPolicy: "auto-high" },
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  settingDefs: [],
};

export function buildFactoryCommand(location: ProjectLocation, executablePath?: string) {
  return buildAgentCommand(
    location,
    "droid",
    [...FACTORY_ACP_ARGS],
    executablePath,
    FACTORY_DISABLE_AUTO_UPDATE_ENV,
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
): Promise<CapabilitiesProbeResult | undefined> {
  const command = buildFactoryCommand(location, executablePath);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  const probe = await probeAcpCapabilities(
    command.command,
    command.args,
    getAgentProbeCwd(location),
    {
      ...(processCwd ? { processCwd } : {}),
      ...(command.env ? { env: command.env } : {}),
      timeoutMs: 30_000,
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
  probeEnv: FACTORY_DISABLE_AUTO_UPDATE_ENV,
  authProbes: [envVarAuthProbe(["FACTORY_API_KEY"])],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath);
  },
};
