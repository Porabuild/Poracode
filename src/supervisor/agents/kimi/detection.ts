import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { AgentCapability, ProjectLocation } from "@/shared/contracts";
import { dedupeAcpAuthMethods, probeAcpCapabilities } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  type CapabilitiesProbeResult,
  type DetectionSpec,
  quotePosixShellArg,
  quotePowerShellLiteral,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";

// Kimi Code exposes three permission modes: manual (the CLI default), auto,
// and yolo. Poracode starts fresh threads in auto mode.
//   • default/manual → no flag
//   • auto           → `--auto`
//   • yolo           → `--yolo` (bypass — auto-approve everything)
// The two auto-approve modes are mutually exclusive at launch.
const KIMI_APPROVAL_POLICIES = [
  { id: "default", label: "Default" },
  { id: "auto", label: "Auto Approve" },
  { id: "yolo", label: "Bypass Approvals" },
] as const;

// Models fill in from the ACP capabilities probe (k3 / kimi-for-coding /
// kimi-for-coding-highspeed). Efforts are probed too; Kimi has no
// `--reasoning-effort` flag, so effort switching only rides the ACP protocol.
export const kimiDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [...KIMI_APPROVAL_POLICIES],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "auto",
  bypassPermissions: { approvalPolicy: "yolo" },
  settingDefs: [],
};

export function buildKimiCommand(location: ProjectLocation, args: string[], wslExecPath?: string) {
  return buildAgentCommand(location, "kimi", args, wslExecPath);
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath?: string,
): Promise<CapabilitiesProbeResult> {
  const spec = buildKimiCommand(location, ["acp"], executablePath);
  const sessionCwd = getAgentProbeCwd(location);
  const processCwd = resolveProbeSpawnCwd(location, spec.cwd);
  // No `authenticateMethodIds`: Kimi's only ACP method is "login" (OAuth device
  // flow), which is interactive — probing must never trigger a browser flow.
  const [probe, credentialState] = await Promise.all([
    probeAcpCapabilities(spec.command, spec.args, sessionCwd, {
      ...(processCwd ? { processCwd } : {}),
      timeoutMs: 20_000,
      label: location.kind === "wsl" ? `kimi:wsl:${location.distro}` : `kimi:${location.kind}`,
    }),
    readKimiCredentialState(location),
  ]);

  let contextCaps: Pick<AgentCapability, "contextSizes" | "modelContextSizes"> = {};
  if (probe?.modelMetadata) {
    const sizes = new Map<string, number>();
    for (const [modelId, meta] of Object.entries(probe.modelMetadata)) {
      const tokens = (meta as { totalContextTokens?: unknown }).totalContextTokens;
      if (typeof tokens === "number" && tokens > 0) sizes.set(modelId, tokens);
    }
    if (sizes.size > 0) {
      contextCaps = buildContextSizeCapabilities(sizes);
    }
  }

  const dedupedAuth = probe?.authMethods?.length
    ? dedupeAcpAuthMethods(probe.authMethods)
    : undefined;

  return {
    ...(probe?.models?.length ? { models: probe.models } : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe?.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe?.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe?.modelDefaultEfforts ? { modelDefaultEfforts: probe.modelDefaultEfforts } : {}),
    ...(probe?.modes?.length ? { modes: probe.modes } : {}),
    ...(probe?.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe?.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    ...contextCaps,
    ...(dedupedAuth?.length ? { authMethods: dedupedAuth } : {}),
    authState: credentialState.hasAnyCredential ? "authenticated" : "missing",
    ...(credentialState.hasManagedOAuthCredential ? { authLogoutSupported: true } : {}),
    // Kimi's supported sign-in path is its CLI login flow (`kimi login`).
    preferTerminalLogin: true,
  };
}

/**
 * True when a Kimi `config.toml` holds a real inline credential. Managed Kimi
 * OAuth providers keep an `api_key` placeholder plus a storage reference in
 * TOML even after logout; their live token is checked separately below.
 */
export function hasKimiCredential(content: string): boolean {
  let parsed: unknown;
  try {
    parsed = parseToml(content);
  } catch {
    return false;
  }
  if (!isRecord(parsed) || !isRecord(parsed.providers)) return false;
  for (const provider of Object.values(parsed.providers)) {
    if (!isRecord(provider)) continue;
    const oauth = isRecord(provider.oauth) ? provider.oauth : undefined;
    if (
      oauth &&
      [oauth.access_token, oauth.refresh_token, oauth.id_token].some(
        (value) => typeof value === "string" && value.length > 0,
      )
    ) {
      return true;
    }
    const usesExternalOAuthStorage =
      oauth && typeof oauth.storage === "string" && typeof oauth.key === "string";
    if (
      !usesExternalOAuthStorage &&
      typeof provider.api_key === "string" &&
      provider.api_key.length > 0
    ) {
      return true;
    }
  }
  return false;
}

export function hasKimiOAuthCredential(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as unknown;
    return (
      isRecord(parsed) &&
      [parsed.access_token, parsed.accessToken].some(
        (value) => typeof value === "string" && value.length > 0,
      )
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function nativeKimiHomePath(): string {
  const kimiHome = process.env["KIMI_CODE_HOME"];
  return kimiHome && kimiHome.trim().length > 0 ? kimiHome : join(homedir(), ".kimi-code");
}

export function nativeKimiOAuthCredentialPath(): string {
  return join(nativeKimiHomePath(), "credentials", "kimi-code.json");
}

async function readKimiCredentialState(location: ProjectLocation): Promise<{
  hasAnyCredential: boolean;
  hasManagedOAuthCredential: boolean;
}> {
  if (location.kind !== "wsl") {
    const [hasConfigCredential, hasManagedOAuthCredential] = await Promise.all([
      readFile(join(nativeKimiHomePath(), "config.toml"), "utf8")
        .then(hasKimiCredential)
        .catch(() => false),
      readFile(nativeKimiOAuthCredentialPath(), "utf8")
        .then(hasKimiOAuthCredential)
        .catch(() => false),
    ]);
    return {
      hasAnyCredential: hasConfigCredential || hasManagedOAuthCredential,
      hasManagedOAuthCredential,
    };
  }
  const [configResult, oauthResult] = await batchWslCommandsAsync(location.distro, [
    'cat "${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml" 2>/dev/null || true',
    'cat "${KIMI_CODE_HOME:-$HOME/.kimi-code}/credentials/kimi-code.json" 2>/dev/null || true',
  ]);
  const hasConfigCredential = configResult?.ok ? hasKimiCredential(configResult.stdout) : false;
  const hasManagedOAuthCredential = oauthResult?.ok
    ? hasKimiOAuthCredential(oauthResult.stdout)
    : false;
  return {
    hasAnyCredential: hasConfigCredential || hasManagedOAuthCredential,
    hasManagedOAuthCredential,
  };
}

export const kimiDetectionSpec: DetectionSpec = {
  kind: "kimi",
  label: "Kimi Code",
  binary: "kimi",
  wslBinaryHome: {
    env: "KIMI_CODE_HOME",
    defaultSubpath: ".kimi-code",
  },
  loginCommand: ({ location, executablePath }) => {
    if (!executablePath) return undefined;
    return location.kind === "windows"
      ? `& ${quotePowerShellLiteral(executablePath)} login`
      : `${quotePosixShellArg(executablePath)} login`;
  },
  capabilities: kimiDefaultCapabilities,
  // `kimi upgrade` is an interactive TUI (arrow-key chooser, no headless flag),
  // so it can't run through the supervisor's non-interactive updater — hence no
  // `builtIn`. Re-run the official install script instead: the same
  // non-interactive path the Settings "Install" card uses, for both Unix
  // (`curl … | bash`) and Windows (`irm … | iex`). `npm` stays only as the
  // latest-version probe that decides whether to surface the update button.
  update: {
    npm: "@moonshot-ai/kimi-code",
    installer: {
      posix: {
        binary: "sh",
        args: ["-c", "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"],
      },
      windows: {
        binary: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "irm https://code.kimi.com/kimi-code/install.ps1 | iex",
        ],
      },
    },
  },
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath);
  },
};
