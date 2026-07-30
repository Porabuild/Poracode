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
  quotePosixShellArg,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";

// Approval policies surfaced to Poracode. Grok only honors `--always-approve`
// (bypass) at launch — `--permission-mode <MODE>` is silently ignored by both
// the TUI and `grok agent stdio` (re-verified live on 0.2.93; see argv.ts).
// We therefore expose a single Default ↔ Bypass Approvals toggle in the
// composer.
const GROK_APPROVAL_POLICIES = [
  { id: "default", label: "Default" },
  { id: "bypassPermissions", label: "Bypass Approvals" },
] as const;

// Plan mode is intentionally omitted from the composer surface: it cannot be
// force-activated at launch on either Grok surface — `--permission-mode plan`
// is silently ignored (verified live on 0.2.93). Plan mode is entered in the
// TUI via Shift+Tab or by the model calling `enter_plan_mode`, so a Plan/Work
// toggle would falsely imply we drive it.
//
// Effort IS surfaced since grok 0.2.x: `--reasoning-effort` is honored at
// launch and the ACP handshake advertises per-model tiers in the models'
// `_meta.reasoningEfforts` — the capabilities probe fills `efforts` /
// `modelEfforts` / `defaultEffort` from it (see mapGrokEffortCapabilities).
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

export function buildGrokCommand(
  location: ProjectLocation,
  args: string[],
  wslExecPath?: string,
  env?: Record<string, string>,
) {
  return buildAgentCommand(location, "grok", args, wslExecPath, env);
}

async function probeCapabilities(
  location: ProjectLocation,
  executablePath?: string,
  env?: Record<string, string>,
): Promise<CapabilitiesProbeResult> {
  const spec = buildGrokCommand(location, ["agent", "stdio"], executablePath, env);
  const sessionCwd = getAgentProbeCwd(location);
  const processCwd = resolveProbeSpawnCwd(location, spec.cwd);
  const probe = await probeAcpCapabilities(spec.command, spec.args, sessionCwd, {
    ...(processCwd ? { processCwd } : {}),
    ...(spec.env ? { env: spec.env } : {}),
    timeoutMs: 20_000, // grok may take a moment on first init
    label: location.kind === "wsl" ? `grok:wsl:${location.distro}` : `grok:${location.kind}`,
    // Grok returns identity (email, auth_mode, subscription_tier) in the
    // `authenticate` response's `_meta`. `cached_token` is the non-interactive
    // method written by `grok login` to `~/.grok/auth.json`, so it's safe to
    // call during detection without triggering a browser flow.
    authenticateMethodIds: ["cached_token"],
  });

  // Extract context windows from model _meta (grok reports totalContextTokens
  // per model, e.g. 500k for grok-4.5 and 200k for grok-composer-2.5-fast).
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

  const effortCaps = mapGrokEffortCapabilities(probe?.modelMetadata);

  const dedupedAuth = probe?.authMethods?.length
    ? dedupeAcpAuthMethods(probe.authMethods)
    : undefined;

  const providerMetadata = buildGrokProviderMetadata(probe?.acpMeta);

  return {
    ...grokDefaultCapabilities,
    ...(probe?.models?.length ? { models: probe.models } : {}),
    // Grok advertises effort tiers in model `_meta`, not standard ACP
    // configOptions — derive them ourselves, but let the generic probe win
    // if Grok ever adds a `thought_level` config option.
    ...(effortCaps.efforts.length
      ? { efforts: effortCaps.efforts, modelEfforts: effortCaps.modelEfforts }
      : {}),
    ...(effortCaps.defaultEffort ? { defaultEffort: effortCaps.defaultEffort } : {}),
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
 * Poracode-canonical effort ordering (ascending). Grok advertises its tiers
 * descending (high → low); the pickers across providers list ascending.
 * Unknown tier ids sort after the known ones, keeping their original order.
 */
const GROK_EFFORT_RANK: Record<string, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
};

type GrokReasoningEffortMeta = { id?: unknown; default?: unknown };

/**
 * Derive effort capabilities from the per-model `_meta.reasoningEfforts` the
 * grok 0.2.x ACP handshake advertises (verified live on 0.2.93: grok-4.5
 * exposes high/medium/low with high as default; grok-composer-2.5-fast
 * advertises none). Models without tiers get an explicit empty list so the
 * shared model picker hides the effort dropdown for them.
 */
export function mapGrokEffortCapabilities(
  modelMetadata: Record<string, Record<string, unknown>> | undefined,
): { efforts: string[]; modelEfforts: Record<string, string[]>; defaultEffort?: string } {
  const modelEfforts: Record<string, string[]> = {};
  let efforts: string[] = [];
  let defaultEffort: string | undefined;

  for (const [modelId, meta] of Object.entries(modelMetadata ?? {})) {
    const raw = (meta as { reasoningEfforts?: unknown }).reasoningEfforts;
    const entries = Array.isArray(raw) ? (raw as GrokReasoningEffortMeta[]) : [];
    const ids = entries.flatMap((entry) => (typeof entry?.id === "string" ? [entry.id] : []));
    const sorted = ids
      .map((id, index) => ({ id, index }))
      .sort(
        (a, b) =>
          (GROK_EFFORT_RANK[a.id] ?? 99 + a.index) - (GROK_EFFORT_RANK[b.id] ?? 99 + b.index),
      ) // unknown ids sort after known tiers, keeping their original order
      .map((entry) => entry.id);
    modelEfforts[modelId] = sorted;
    if (sorted.length > efforts.length) efforts = sorted;
    if (!defaultEffort) {
      const def = entries.find((entry) => entry?.default === true);
      if (def && typeof def.id === "string") defaultEffort = def.id;
    }
  }

  return { efforts, modelEfforts, ...(defaultEffort ? { defaultEffort } : {}) };
}

/**
 * Grok's ACP `authenticate` response (with the `cached_token` method) returns
 * identity fields in `_meta` — `email`, `auth_mode`, `subscription_tier`, and
 * since 0.2.x also team fields (`team_name`). See
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
    ...(pick("team_name") ? { organization: pick("team_name") } : {}),
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
  const configuredHome = ctx.probeEnv?.GROK_HOME?.trim();
  const check = (home: string, isGrokHome = false) => {
    if (existsSync(join(home, ...(isGrokHome ? [] : [".grok"]), "auth.json"))) {
      return "authenticated";
    }
    return "unknown";
  };
  if (ctx.location.kind !== "wsl") {
    return check(configuredHome || homedir(), Boolean(configuredHome));
  }
  const authPath = configuredHome ? `${configuredHome}/auth.json` : "~/.grok/auth.json";
  const [r] = await batchWslCommandsAsync(ctx.location.distro, [
    `test -f ${configuredHome ? quotePosixShellArg(authPath) : authPath} && echo yes || echo no`,
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
    return probeCapabilities(ctx.location, ctx.executablePath, ctx.probeEnv);
  },
};
