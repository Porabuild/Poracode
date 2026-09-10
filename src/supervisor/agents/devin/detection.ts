import type { AgentCapability, ProjectLocation } from "@/shared/contracts";
import { dedupeAcpAuthMethods, probeAcpCapabilities, type AcpProbeResult } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  envVarAuthProbe,
  quotePosixShellArg,
  quotePowerShellLiteral,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { loadDevinModels } from "./modelCatalog";
import { devinModelCapabilities } from "./models";
import { parseDevinCredentials, readDevinCredentials } from "./credentials";

export const devinDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "normal", label: "Normal" },
    { id: "accept-edits", label: "Accept Edits" },
    { id: "smart", label: "Smart" },
    { id: "bypass", label: "Bypass Approvals" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  mcpScope: { terminal: "none", gui: "launch" },
  defaultApprovalPolicy: "smart",
  presentationCapabilities: { gui: { defaultApprovalPolicy: "bypass" } },
  bypassPermissions: { approvalPolicy: "bypass" },
  settingDefs: [],
};

export function buildDevinCommand(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
) {
  return buildAgentCommand(location, "devin", args, executablePath);
}

export function buildDevinProbeCapabilities(
  probe: AcpProbeResult | undefined,
): CapabilitiesProbeResult {
  return {
    ...(probe?.models?.length ? { models: probe.models } : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe?.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe?.modes?.length ? { modes: probe.modes } : {}),
    ...(probe?.slashCommands ? { slashCommands: probe.slashCommands } : {}),

    authMethods: dedupeAcpAuthMethods([
      ...(probe?.authMethods ?? []),
      { id: "devin-terminal-login", name: "Login", type: "terminal" },
    ]),
    authLogoutSupported: true,
  };
}

export const devinDetectionSpec: DetectionSpec = {
  kind: "devin",
  label: "Devin",
  binary: "devin",
  versionArgs: ["--version"],
  capabilities: devinDefaultCapabilities,
  loginCommand: ({ location, executablePath }) =>
    executablePath
      ? location.kind === "windows"
        ? `& ${quotePowerShellLiteral(executablePath)} auth login`
        : `${quotePosixShellArg(executablePath)} auth login`
      : undefined,
  update: {
    // `devin update` requires an interactive terminal; installers are noninteractive.
    homebrewCask: "devin-cli",
    winget: "CognitionAI.DevinCLI",
    latestVersionUrls: ["https://static.devin.ai/cli/current/manifest.json"],
    installer: {
      posix: { binary: "sh", args: ["-c", "curl -fsSL https://cli.devin.ai/install.sh | bash"] },
      windows: {
        binary: "powershell.exe",
        args: ["-NoProfile", "-Command", "irm https://static.devin.ai/cli/setup.ps1 | iex"],
      },
    },
  },
  authProbes: [
    envVarAuthProbe(["WINDSURF_API_KEY"]),
    async ({ location }) => {
      if (location.kind !== "wsl")
        return (await readDevinCredentials()) ? "authenticated" : "missing";
      const [result] = await batchWslCommandsAsync(location.distro, [
        'if [ -n "$WINDSURF_API_KEY" ]; then printf authenticated; else cat "${XDG_DATA_HOME:-$HOME/.local/share}/devin/credentials.toml" 2>/dev/null; fi',
      ]);
      return result?.stdout === "authenticated" ||
        (result?.ok && parseDevinCredentials(result.stdout))
        ? "authenticated"
        : "missing";
    },
  ],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const command = buildDevinCommand(ctx.location, ["acp"], ctx.executablePath);
    const processCwd = resolveProbeSpawnCwd(ctx.location, command.cwd);
    const catalogPromise = loadDevinModels(ctx.location, ctx.executablePath, ctx.signal).catch(
      () => undefined,
    );
    const probe = await probeAcpCapabilities(
      command.command,
      command.args,
      getAgentProbeCwd(ctx.location),
      {
        ...(processCwd ? { processCwd } : {}),
        ...(command.env ? { env: command.env } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        timeoutMs: 30_000,
        label: `devin:${ctx.location.kind}`,
      },
    );
    const families = await catalogPromise;
    return {
      ...buildDevinProbeCapabilities(probe),
      ...(families?.length ? devinModelCapabilities(families) : {}),
    };
  },
};
