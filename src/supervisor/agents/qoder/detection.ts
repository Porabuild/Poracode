import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentTerminalAuthMethod, ProjectLocation } from "@/shared/contracts";
import { probeAcpCapabilities, type AcpProbeResult } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  envVarAuthProbe,
  type AuthProbe,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { QODER_DEFAULT_MODEL_ID } from "./argv";

export const qoderDefaultCapabilities: AgentCapability = {
  models: [{ id: QODER_DEFAULT_MODEL_ID, label: "Auto" }],
  efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "acceptEdits", label: "Accept Edits" },
    { id: "bypassPermissions", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "bypassPermissions",
  bypassPermissions: { approvalPolicy: "bypassPermissions" },
  mcpScope: { terminal: "none", gui: "launch" },
  settingDefs: [],
};

export function buildQoderCommand(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
) {
  return buildAgentCommand(location, "qodercli", args, executablePath);
}

const terminalAuthMethod: AgentTerminalAuthMethod = {
  id: "qoder-terminal-login",
  name: "Login",
  type: "terminal",
};

export const QODER_AUTH_ENV_KEYS = ["QODER_PERSONAL_ACCESS_TOKEN"] as const;

/**
 * qodercli persists account sign-in to `~/.qoder/.auth/user`. The config root
 * itself is created on first run (before any login), so key off the
 * credential file, not the directory.
 */
const credentialFileAuthProbe: AuthProbe = async (ctx) => {
  if (ctx.location.kind !== "wsl") {
    return existsSync(join(homedir(), ".qoder", ".auth", "user")) ? "authenticated" : "unknown";
  }
  const [result] = await batchWslCommandsAsync(ctx.location.distro, [
    "test -f ~/.qoder/.auth/user && echo yes",
  ]);
  return result?.ok && result.stdout.trim() === "yes" ? "authenticated" : "unknown";
};

export function buildQoderProbeCapabilities(
  probe: AcpProbeResult | undefined,
): CapabilitiesProbeResult {
  return {
    ...qoderDefaultCapabilities,
    ...(probe?.models?.length ? { models: probe.models } : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe?.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe?.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    modes: [...new Set([...qoderDefaultCapabilities.modes, ...(probe?.modes ?? [])])],
    ...(probe?.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe?.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    authMethods: [terminalAuthMethod],
    preferTerminalLogin: true,
    // NB: qodercli's `session/new` succeeds without sign-in (prompts fail
    // later), so the probe's session-derived authState is meaningless for
    // Qoder; the env / credential-file probes carry the real state.
  };
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath: string,
): Promise<CapabilitiesProbeResult> {
  const command = buildQoderCommand(location, ["--acp"], executablePath);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  const probe = await probeAcpCapabilities(
    command.command,
    command.args,
    getAgentProbeCwd(location),
    {
      ...(processCwd ? { processCwd } : {}),
      ...(command.env ? { env: command.env } : {}),
      timeoutMs: 20_000,
      label: location.kind === "wsl" ? `qoder:wsl:${location.distro}` : `qoder:${location.kind}`,
    },
  );
  return buildQoderProbeCapabilities(probe);
}

export const qoderDetectionSpec: DetectionSpec = {
  kind: "qoder",
  label: "Qoder",
  binary: "qodercli",
  loginCommand: "qodercli login",
  capabilities: qoderDefaultCapabilities,
  update: {
    builtIn: { binary: "qodercli", args: ["update"] },
    npm: "@qoder-ai/qodercli",
  },
  authProbes: [envVarAuthProbe([...QODER_AUTH_ENV_KEYS]), credentialFileAuthProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath);
  },
};
