import type {
  AgentCapability,
  AgentConnectedProvider,
  AgentTerminalAuthMethod,
  ProjectLocation,
} from "@/shared/contracts";
import { sortEffortsByCanonicalOrder } from "@/shared/effortOrder";
import {
  buildAgentCommand,
  envVarAuthProbe,
  readAgentCommandOutput,
  type CapabilitiesProbeResult,
  type DetectProbeCtx,
  type DetectionSpec,
} from "../base";
import { readFxConnectedProviders } from "./credentials";

// Verified against fx 0.0.15. `models --json` lists the catalog of fx's active
// provider (gateway / codex / grok), so it is authoritative for models and
// efforts while `status --json` supplies the default model and signed-in state.
export const fxDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  defaultEffort: "auto",
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [
    { id: "auto", label: "Auto" },
    { id: "ask", label: "Ask" },
    { id: "bypassPermissions", label: "Full Access" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "auto",
  bypassPermissions: { approvalPolicy: "bypassPermissions" },
  mcpScope: { terminal: "none", gui: "launch" },
  settingDefs: [],
};

// fx self-updates in the background on spawn; every Poracode-made spawn opts out.
export const FX_BASE_SPAWN_ENV = { FX_AUTO_UPGRADE: "0" };

export const FX_TERMINAL_AUTH_METHOD: AgentTerminalAuthMethod = {
  id: "fx-terminal-login",
  name: "Login",
  type: "terminal",
};

export function buildFxCommand(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
  env?: Record<string, string>,
) {
  return buildAgentCommand(location, "fx", args, executablePath, env);
}

export interface FxStatusSummary {
  /** Default model reported by `fx status --json`. */
  model?: string;
  /** Auth source label; "missing" means signed out. */
  auth?: string;
  /** Advertised permission/mode ids in fx order. */
  modes: string[];
}

export interface FxModelSummary {
  id: string;
  name: string;
  efforts: string[];
  fast: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseJsonRecord(stdout: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(stdout));
  } catch {
    return undefined;
  }
}

export function parseFxStatusJson(stdout: string): FxStatusSummary | undefined {
  const parsed = parseJsonRecord(stdout);
  if (!parsed || parsed.kind !== "status") return undefined;
  const modes = Array.isArray(parsed.modes)
    ? parsed.modes.flatMap((entry) => {
        const record = asRecord(entry);
        return typeof record?.id === "string" && record.id.length > 0 ? [record.id] : [];
      })
    : [];
  return {
    ...(typeof parsed.model === "string" && parsed.model.length > 0 ? { model: parsed.model } : {}),
    ...(typeof parsed.auth === "string" && parsed.auth.length > 0 ? { auth: parsed.auth } : {}),
    modes,
  };
}

export function parseFxModelsJson(stdout: string): FxModelSummary[] | undefined {
  const parsed = parseJsonRecord(stdout);
  if (!parsed || parsed.kind !== "models" || !Array.isArray(parsed.models)) return undefined;
  const models: FxModelSummary[] = [];
  for (const entry of parsed.models) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== "string" || record.id.length === 0) continue;
    models.push({
      id: record.id,
      name: typeof record.name === "string" ? record.name : "",
      efforts: Array.isArray(record.efforts)
        ? record.efforts.filter((effort): effort is string => typeof effort === "string")
        : [],
      fast: record.fast === true,
    });
  }
  return models;
}

/**
 * Build the capabilities probe result from `fx status --json` and
 * `fx models --json`. Poracode defaults new threads to `models[0]`, so the
 * status default model is moved to the front of fx's catalog order.
 */
export function buildFxCapabilities(
  status: FxStatusSummary | undefined,
  models: readonly FxModelSummary[] | undefined,
  connectedProviders?: AgentConnectedProvider[],
): CapabilitiesProbeResult {
  const catalog: FxModelSummary[] =
    models && models.length > 0
      ? [...models]
      : status?.model
        ? [{ id: status.model, name: status.model, efforts: [], fast: false }]
        : [];

  if (status?.model) {
    const defaultIndex = catalog.findIndex((model) => model.id === status.model);
    if (defaultIndex > 0) {
      const [defaultModel] = catalog.splice(defaultIndex, 1);
      if (defaultModel) catalog.unshift(defaultModel);
    }
  }

  const modelEfforts: Record<string, string[]> = {};
  for (const model of catalog) {
    modelEfforts[model.id] =
      model.efforts.length === 0
        ? []
        : [
            ...sortEffortsByCanonicalOrder(model.efforts.filter((effort) => effort !== "auto")),
            "auto",
          ];
  }

  const defaultModelId = catalog[0]?.id;
  const efforts = defaultModelId ? (modelEfforts[defaultModelId] ?? []) : [];

  const ids = catalog.map((model) => model.id);
  let subProviders: AgentCapability["subProviders"];
  if (ids.length > 0 && ids.every((id) => id.includes("/"))) {
    const prefixes = new Map<string, string>();
    for (const id of ids) {
      const prefix = id.slice(0, id.indexOf("/"));
      if (!prefixes.has(prefix)) prefixes.set(prefix, prefix);
    }
    subProviders = [...prefixes.keys()].map((prefix) => ({ id: prefix, label: prefix }));
  }

  const fastModels = catalog.filter((model) => model.fast).map((model) => model.id);

  const authState =
    status?.auth === "missing"
      ? ("missing" as const)
      : status?.auth
        ? ("authenticated" as const)
        : undefined;

  return {
    ...fxDefaultCapabilities,
    models: catalog.map((model) => ({ id: model.id, label: model.name.trim() || model.id })),
    efforts,
    defaultEffort: "auto",
    modelEfforts,
    ...(subProviders ? { subProviders } : {}),
    ...(fastModels.length > 0 ? { fastModels } : {}),
    ...(authState ? { authState } : {}),
    authMethods: [FX_TERMINAL_AUTH_METHOD],
    // No generic logout: fx signs out per backend (`fx logout <backend>`)
    // through the provider panel's manageCredentials.
    ...(connectedProviders ? { providerMetadata: { connectedProviders } } : {}),
  };
}

export async function probeFxCapabilities(ctx: DetectProbeCtx): Promise<CapabilitiesProbeResult> {
  const executablePath = ctx.executablePath;
  if (!executablePath) return buildFxCapabilities(undefined, undefined);
  const options = {
    timeoutMs: 15_000,
    ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  };
  const [statusResult, modelsResult, connectedProviders] = await Promise.all([
    readAgentCommandOutput(ctx.location, executablePath, ["status", "--json"], options),
    readAgentCommandOutput(ctx.location, executablePath, ["models", "--json"], options),
    readFxConnectedProviders(ctx.location, executablePath, options),
  ]);
  return buildFxCapabilities(
    statusResult.ok ? parseFxStatusJson(statusResult.stdout) : undefined,
    modelsResult.ok ? parseFxModelsJson(modelsResult.stdout) : undefined,
    connectedProviders,
  );
}

export const fxDetectionSpec: DetectionSpec = {
  kind: "fx",
  label: "fx",
  binary: "fx",
  loginCommand: "fx login",
  capabilities: fxDefaultCapabilities,
  baseSpawnEnv: FX_BASE_SPAWN_ENV,
  update: {
    builtIn: { binary: "fx", args: ["upgrade"] },
    latestVersionUrls: ["https://releases.fx.sh/latest.txt"],
  },
  authProbes: [envVarAuthProbe(["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"])],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    return probeFxCapabilities(ctx);
  },
};
