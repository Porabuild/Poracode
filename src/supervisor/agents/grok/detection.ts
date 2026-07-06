import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  compactAgentProviderMetadata,
  type AgentCapability,
  type AgentProviderMetadata,
  type ProjectLocation,
} from "@/shared/contracts";
import { dedupeAcpAuthMethods, probeAcpCapabilities } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  envVarAuthProbe,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";

// Approval policies surfaced to Poracode. Grok only honors `--always-approve`
// (bypass) at launch — `--permission-mode <MODE>` is headless-only and is
// silently ignored by both the TUI and `grok agent stdio`. We therefore
// expose a single Default ↔ Bypass Approvals toggle in the composer.
const GROK_APPROVAL_POLICIES = [
  { id: "default", label: "Default" },
  { id: "bypassPermissions", label: "Bypass Approvals" },
] as const;

// Plan mode and effort are intentionally omitted from the composer surface:
//   • Plan mode cannot be force-activated at launch on either Grok surface —
//     `--permission-mode plan` is silently ignored. The model has to call
//     `enter_plan_mode` itself (`~/.grok/docs/user-guide/19-plan-mode.md`),
//     so a Plan/Work toggle would falsely imply we drive it.
//   • Effort selection (`--effort` / `--reasoning-effort`) is headless-only
//     for the CLI and not advertised by ACP either, so surfacing it would
//     be misleading.
export const grokDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [...GROK_APPROVAL_POLICIES],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "default",
  bypassPermissions: { approvalPolicy: "bypassPermissions" },
  settingDefs: [],
};

export function buildGrokCommand(location: ProjectLocation, args: string[], wslExecPath?: string) {
  return buildAgentCommand(location, "grok", args, wslExecPath);
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath?: string,
): Promise<CapabilitiesProbeResult> {
  const spec = buildGrokCommand(location, ["agent", "stdio"], executablePath);
  const sessionCwd = getAgentProbeCwd(location);
  const processCwd = resolveProbeSpawnCwd(location, spec.cwd);
  const probe = await probeAcpCapabilities(spec.command, spec.args, sessionCwd, {
    ...(processCwd ? { processCwd } : {}),
    timeoutMs: 20_000, // grok may take a moment on first init
    label: location.kind === "wsl" ? `grok:wsl:${location.distro}` : `grok:${location.kind}`,
    // Grok returns identity (email, auth_mode, subscription_tier) in the
    // `authenticate` response's `_meta`. `cached_token` is the non-interactive
    // method written by `grok login` to `~/.grok/auth.json`, so it's safe to
    // call during detection without triggering a browser flow.
    authenticateMethodIds: ["cached_token"],
  });

  // Extract context window from model _meta (grok reports totalContextTokens)
  let contextCaps: Pick<AgentCapability, "contextSizes" | "modelContextSizes"> = {};
  if (probe?.modelMetadata) {
    const meta = probe.modelMetadata["grok-build"] ?? Object.values(probe.modelMetadata)[0];
    const tokens = (meta as { totalContextTokens?: unknown })?.totalContextTokens;
    if (typeof tokens === "number" && tokens > 0) {
      contextCaps = buildContextSizeCapabilities(new Map([["grok-build", tokens]]));
    }
  }

  const dedupedAuth = probe?.authMethods?.length
    ? dedupeAcpAuthMethods(probe.authMethods)
    : undefined;

  const providerMetadata = buildGrokProviderMetadata(probe?.acpMeta);

  return {
    ...grokDefaultCapabilities,
    ...(probe?.models?.length ? { models: probe.models } : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe?.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe?.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe?.modes?.length ? { modes: probe.modes } : {}),
    ...(probe?.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe?.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    ...contextCaps,
    ...(dedupedAuth?.length ? { authMethods: dedupedAuth } : {}),
    // Grok always supports `grok logout` when the binary is present (CLI + ACP path).
    authLogoutSupported: true,
    // Grok's supported sign-in path is its CLI login flow; ACP auth methods
    // exist but the terminal command is what login UIs should lead with.
    preferTerminalLogin: true,
    ...(probe?.authState ? { authState: probe.authState } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

/**
 * Grok's ACP `authenticate` response (with the `cached_token` method) returns
 * identity fields in `_meta` — `email`, `auth_mode`, `subscription_tier`. See
 * https://docs.x.ai/build/cli/headless-scripting#acp. Translate them into the
 * shared `AgentProviderMetadata` shape so the settings UI shows the signed-in
 * email / plan instead of a generic "Signed in" line.
 */
export function buildGrokProviderMetadata(
  meta: Record<string, unknown> | undefined,
): AgentProviderMetadata | undefined {
  if (!meta) return undefined;
  const pick = (key: string): string | undefined => {
    const value = meta[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  };
  const authMode = pick("auth_mode");
  return compactAgentProviderMetadata({
    ...(pick("email") ? { authenticatedAs: pick("email") } : {}),
    ...(pick("subscription_tier") ? { plan: pick("subscription_tier") } : {}),
    ...(authMode ? { authMethod: formatGrokAuthMode(authMode) } : {}),
  });
}

function formatGrokAuthMode(mode: string): string {
  if (mode.toLowerCase() === "oidc") return "OIDC";
  return mode;
}

/**
 * Grok stores auth in ~/.grok/auth.json.
 */
async function grokAuthFileProbe(
  ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0],
): Promise<"authenticated" | "unknown"> {
  const check = (home: string) => {
    if (existsSync(join(home, ".grok", "auth.json"))) return "authenticated";
    return "unknown";
  };
  if (ctx.location.kind !== "wsl") {
    return check(homedir());
  }
  const [r] = await batchWslCommandsAsync(ctx.location.distro, [
    "test -f ~/.grok/auth.json && echo yes || echo no",
  ]);
  return r?.ok && r.stdout.trim() === "yes" ? "authenticated" : "unknown";
}

export const grokDetectionSpec: DetectionSpec = {
  kind: "grok",
  label: "Grok Build",
  binary: "grok",
  loginCommand: ({ location }) =>
    location.kind === "wsl" ? "grok login --device-auth" : "grok login",
  capabilities: grokDefaultCapabilities,
  update: {
    builtIn: { binary: "grok", args: ["update"] },
    npm: "@xai-official/grok",
    latestVersionUrls: [
      "https://x.ai/cli/stable",
      "https://storage.googleapis.com/grok-build-public-artifacts/cli/stable",
    ],
  },
  // Auth detection prefers XAI_API_KEY / GROK_API_KEY (for "xai.api_key" ACP method)
  // then falls back to ~/.grok/auth.json (populated by `grok login` → "cached_token").
  // See https://docs.x.ai/build/enterprise#authentication
  authProbes: [envVarAuthProbe(["GROK_API_KEY", "XAI_API_KEY"]), grokAuthFileProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeCapabilities(ctx.location, ctx.executablePath);
  },
};
