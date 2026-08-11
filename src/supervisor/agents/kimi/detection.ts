import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { AgentCapability, AgentTerminalAuthMethod, ProjectLocation } from "@/shared/contracts";
import { probeAcpCapabilities, type AcpProbeResult } from "../acp";
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
import { kimiThoughtLevelChoices, preferredKimiThoughtTier } from "./thoughtLevels";
import { ensureKimiWorkspaceTrust } from "./kimiTrust";
import { nativeKimiHomePath, nativeKimiOAuthCredentialPath } from "./paths";

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

// 0.33.0's agent-core-v2 ACP server no longer drives the OAuth device flow
// from `authenticate` — it only re-validates auth state. Sign-in happens in a
// terminal instead, through `kimiDetectionSpec.loginCommand`. Advertise a
// static terminal method (the Qwen pattern) so the Login button survives even
// when the ACP probe itself fails. The method carries no `args`: the renderer
// runs `status.loginCommand` and reads only `env` off the method, so anything
// else here would be inert.
export const kimiTerminalAuthMethod: AgentTerminalAuthMethod = {
  id: "kimi-terminal-login",
  name: "Login",
  type: "terminal",
};

/**
 * Turn Kimi's `thought_level` selector into real effort tiers.
 *
 * Each model keeps the levels it actually offers (see thoughtLevels.ts for the
 * probed payloads): the `low`/`high`/`max` ladder for K3, and the lone untiered
 * `on` for K2.7 — which the composer renders as no picker at all, since there is
 * nothing to choose, while still giving the thread a level to send.
 *
 * Kimi reports `currentValue: "on"` even for the tiered K3 models, so defaults
 * resolve through {@link preferredKimiThoughtTier} (`high`) rather than adopting
 * a level the model does not offer.
 */
export function normalizeKimiProbeEfforts(probe: AcpProbeResult | undefined): {
  efforts?: string[];
  defaultEffort?: string;
  modelEfforts?: Record<string, string[]>;
  modelDefaultEfforts?: Record<string, string>;
} {
  const efforts = kimiThoughtLevelChoices(probe?.efforts ?? []);
  const defaultEffort = preferredKimiThoughtTier(efforts, probe?.defaultEffort);
  const modelEfforts: Record<string, string[]> = {};
  for (const [modelId, levels] of Object.entries(probe?.modelEfforts ?? {})) {
    // Record every probed model, including the untiered ones: consumers resolve
    // `modelEfforts[model] ?? efforts`, so omitting a model makes it inherit the
    // global list — and that list holds only the levels of whichever model the
    // probe started on, which is whatever the Kimi CLI last persisted.
    modelEfforts[modelId] = kimiThoughtLevelChoices(levels);
  }
  // Kimi's probed default (`on`) names no tier for the tiered models, so resolve
  // every model's default against the levels that model actually offers.
  const modelDefaultEfforts: Record<string, string> = {};
  const probedModelIds = new Set([
    ...Object.keys(modelEfforts),
    ...Object.keys(probe?.modelDefaultEfforts ?? {}),
  ]);
  for (const modelId of probedModelIds) {
    const levels = modelEfforts[modelId] ?? efforts;
    const level = preferredKimiThoughtTier(levels, probe?.modelDefaultEfforts?.[modelId]);
    if (level) modelDefaultEfforts[modelId] = level;
  }
  return {
    ...(efforts.length > 0 ? { efforts, ...(defaultEffort ? { defaultEffort } : {}) } : {}),
    ...(Object.keys(modelEfforts).length > 0 ? { modelEfforts } : {}),
    ...(Object.keys(modelDefaultEfforts).length > 0 ? { modelDefaultEfforts } : {}),
  };
}

export function buildKimiProbeCapabilities(
  probe: AcpProbeResult | undefined,
  credentialState: {
    hasAnyCredential: boolean;
    hasManagedOAuthCredential: boolean;
  },
): CapabilitiesProbeResult {
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

  return {
    // 0.33.0 carries no model list on `initialize`; models arrive on
    // `session/new` configOptions, which the shared probe already maps.
    ...(probe?.models?.length ? { models: probe.models } : {}),
    ...normalizeKimiProbeEfforts(probe),
    ...(probe?.modes?.length ? { modes: probe.modes } : {}),
    ...(probe?.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe?.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    ...contextCaps,
    authMethods: [kimiTerminalAuthMethod],
    // Prefer the ACP-native auth signal (session/new succeeded → authenticated,
    // `auth_required` → missing); fall back to the credential files when the
    // probe couldn't decide.
    authState: probe?.authState ?? (credentialState.hasAnyCredential ? "authenticated" : "missing"),
    // v2 advertises `agentCapabilities.auth.logout` (the ACP logout RPC); the
    // legacy engine has no RPC but its managed OAuth token file can be
    // removed directly — the adapter's logout command handles both.
    ...(probe?.authLogoutSupported || credentialState.hasManagedOAuthCredential
      ? { authLogoutSupported: true }
      : {}),
    preferTerminalLogin: true,
  };
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath?: string,
  signal?: AbortSignal,
): Promise<CapabilitiesProbeResult> {
  const spec = buildKimiCommand(location, ["acp"], executablePath);
  const sessionCwd = getAgentProbeCwd(location);
  const processCwd = resolveProbeSpawnCwd(location, spec.cwd);
  // `session/new` is what decides `authState`, models and modes, so the probe
  // must not be the one call that trips over 0.33's workspace-trust gate.
  // Trust the probe's own cwd (a scratch dir on posix hosts, the project
  // elsewhere) rather than the project path a launch would use.
  // Only the ACP probe depends on the trust marker, so read the credential
  // files (another WSL round trip) alongside the marker write instead of after.
  const credentialStatePromise = readKimiCredentialState(location);
  await ensureKimiWorkspaceTrust(location, sessionCwd);
  // No `authenticateMethodIds`: on the legacy engine `authenticate` triggers
  // the interactive OAuth device flow, and on 0.33.0's v2 server it only
  // re-validates — probing must never invoke either.
  const probe = await probeAcpCapabilities(spec.command, spec.args, sessionCwd, {
    ...(processCwd ? { processCwd } : {}),
    timeoutMs: 20_000,
    ...(signal ? { signal } : {}),
    label: location.kind === "wsl" ? `kimi:wsl:${location.distro}` : `kimi:${location.kind}`,
  });
  return buildKimiProbeCapabilities(probe, await credentialStatePromise);
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
  // The v2 terminal-auth entry point: `kimi acp --login` runs the device-code
  // login flow in the terminal and exits. This is the only thing that drives a
  // Kimi sign-in — the renderer's Login button runs exactly this string.
  // Works on the legacy engine too.
  loginCommand: ({ location, executablePath }) => {
    if (!executablePath) return undefined;
    return location.kind === "windows"
      ? `& ${quotePowerShellLiteral(executablePath)} acp --login`
      : `${quotePosixShellArg(executablePath)} acp --login`;
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
    return probeCapabilities(ctx.location, ctx.executablePath, ctx.signal);
  },
};
