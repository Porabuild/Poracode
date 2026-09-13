import { OPENCODE2_ENV, parseOpenCode2Version, supportsOpenCode2Version } from "./binary";
import { quotePosixShellArg, quotePowerShellLiteral } from "../base/shellBasics";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentSlashCommand, ProjectLocation } from "@/shared/contracts";
import { mapOpenCode2Agents, mapOpenCode2Commands, mapOpenCode2Skills } from "./commands";
import { sortEffortsByCanonicalOrder } from "@/shared/effortOrder";
import { configFileAuthProbe, readAgentCommandOutput, type DetectionSpec } from "../base";
import type { StatusProbeResult } from "../base/types";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { acquireOpenCode2Server, resolveOpenCode2SessionDirectory } from "./client";
import {
  buildOpenCode2StatusFromIntegrations,
  readOpenCode2Integrations,
  type OpenCode2InventoryIntegration,
} from "./credentials";

// Provider default for the default model's effort ladder. OpenCode Go's
// deepseek-v4.1-flash ships `low`/`high`/`max` and OpenCode 2's own default is
// the strongest tier, so Poracode follows it rather than OpenCode 1's `medium`.
const OPENCODE2_PREFERRED_DEFAULT_EFFORT = "max";

export const opencode2DefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  // OpenCode 2 exposes the built-in `build` (default) and `plan` agents. The
  // HTTP API accepts `session.switchAgent`; the renderer's Plan toggle
  // flips `ThreadConfig.mode` and the structured session applies it before
  // submitting a prompt. `plan` is only advertised once the catalog confirms the agent
  // exists and is user-visible.
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsTextOnlyOneShot: true,
  reportsSkillCatalog: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  // GUI presentation runs on the V2 HTTP server (long-lived `opencode2 serve`
  // + SSE stream); terminal stays the default and reuses the same pooled
  // server for session-id allocation.
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // MCP is provider-level for OpenCode 2: the composer shows the effective set
  // read-only, while changes stay on the provider settings page. The set comes
  // from the OpenCode 2 settings page (`agentSettings.opencode2`) and is
  // applied to each location directory inside the shared runtime server.
  mcpScope: { terminal: "none", gui: "none" },
  mcpConfigSource: "agentSettings",
  agentSettingsDefaults: { crossagentMcp: true },
  // Crossagents calls from pooled GUI sessions are routed by the trusted
  // provider session id, so every directory/session shares one MCP credential.
  crossagentMcpRouting: "provider-session",
  settingDefs: [],
};

/**
 * OpenCode 2 shares OpenCode 1's on-disk state, so credentials live in the
 * same `~/.local/share/opencode/auth.json` after `opencode2 auth login`.
 * Existence is good enough as an "authenticated" signal — the host can't
 * validate the token without spending a request.
 */
function opencode2NativeAuthPath(): string {
  return join(homedir(), ".local", "share", "opencode", "auth.json");
}

/** Per-model entry from the V2 catalog, normalised for the capability builder. */
export interface OpenCode2InventoryModel {
  /** Composite id the rest of Poracode keys models by: `${providerID}/${id}`. */
  id: string;
  /** Server-supplied display name; falls back to the composite id when empty. */
  label: string;
  variants: string[];
  contextLimit?: number;
}

/** Per-provider entry from the V2 provider catalog. */
export interface OpenCode2InventoryProvider {
  id: string;
  name: string;
}

/** Per-agent entry from the V2 agent catalog. */
export interface OpenCode2InventoryAgent {
  id: string;
  mode: "primary" | "subagent" | "all";
  hidden: boolean;
}

/** Aggregate catalog inventory returned by the V2 probe. */
export interface OpenCode2Inventory {
  models: OpenCode2InventoryModel[];
  commands?: AgentSlashCommand[];
  providers: OpenCode2InventoryProvider[];
  /**
   * Upstream AI providers and the credentials stored for them. OpenCode
   * authenticates per provider, so this — not the provider catalog, which also
   * lists auto-activated providers — is what says who is signed in.
   */
  integrations: OpenCode2InventoryIntegration[];
  agents: OpenCode2InventoryAgent[];
  /** Server-configured default model, when the catalog reports one. */
  defaultModel?: { providerID: string; id: string } | undefined;
}

function defaultEffortFor(ordered: readonly string[]): { defaultEffort?: string } {
  if (ordered.includes(OPENCODE2_PREFERRED_DEFAULT_EFFORT)) {
    return { defaultEffort: OPENCODE2_PREFERRED_DEFAULT_EFFORT };
  }
  return ordered.length > 0 ? { defaultEffort: ordered[0]! } : {};
}

/**
 * Build the `capabilitiesProbe` return value from a V2 catalog inventory.
 *
 * The V2 HTTP API gives us everything directly:
 *   - per-model display `name` (no slug-titleization heuristics needed)
 *   - per-model `variants` (the effort tiers `session.prompt` accepts)
 *   - per-model `limit.context` token counts
 *   - the provider list (sub-provider grouping in the model picker)
 *   - the agent list (whether the built-in `plan` agent is user-visible)
 */
export function buildOpenCode2CapabilityPartialFromInventory(
  inventory: OpenCode2Inventory,
): Partial<AgentCapability> {
  const modelEfforts: Record<string, string[]> = {};
  const modelTokens = new Map<string, number>();
  for (const model of inventory.models) {
    modelEfforts[model.id] = model.variants;
    if (model.contextLimit !== undefined) modelTokens.set(model.id, model.contextLimit);
  }

  // The effort ladder follows the DEFAULT model rather than the union across
  // the catalog: the composer should offer the tiers the out-of-the-box model
  // actually exposes (live: low/high/max on opencode-go/deepseek-v4.1-flash),
  // while `modelEfforts` still scopes each model to its own set.
  const defaultModelId = inventory.defaultModel
    ? `${inventory.defaultModel.providerID}/${inventory.defaultModel.id}`
    : undefined;
  const ordered = sortEffortsByCanonicalOrder(
    defaultModelId ? (modelEfforts[defaultModelId] ?? []) : [],
  );

  // Plan mode is the built-in non-hidden primary `plan` agent; "agent" is
  // always available.
  const modes: AgentCapability["modes"] = ["agent"];
  if (
    inventory.agents.some(
      (agent) => agent.id === "plan" && !agent.hidden && agent.mode !== "subagent",
    )
  ) {
    modes.push("plan");
  }

  return {
    models: [...inventory.models]
      .toSorted((left, right) => left.label.localeCompare(right.label))
      .map(({ id, label }) => ({ id, label })),
    subProviders: inventory.providers.map((provider) => ({
      id: provider.id,
      label: provider.name.trim().length > 0 ? provider.name : provider.id,
    })),
    efforts: ordered,
    modelEfforts,
    modes,
    ...(inventory.commands ? { slashCommands: inventory.commands } : {}),
    ...defaultEffortFor(ordered),
    ...buildContextSizeCapabilities(modelTokens),
  };
}

// The V2 catalog endpoints answer with empty lists until plugin activation
// settles. Live servers activate in well under a second, but a first launch
// that has to build its catalog can stall much longer, so the activation wait
// gets its own generous budget.
const OPENCODE2_ACTIVATION_TIMEOUT_MS = 60_000;
const OPENCODE2_CATALOG_TIMEOUT_MS = 15_000;

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Acquire the runtime sidecar and read the V2 catalog for this location.
 * The returned promise rejects on any failure; callers keep the default
 * capabilities and log the failure mode.
 */
export async function probeOpenCode2Inventory(
  location: ProjectLocation,
  signal?: AbortSignal,
): Promise<OpenCode2Inventory> {
  signal?.throwIfAborted();
  const acquired = await acquireOpenCode2Server({ projectLocation: location });

  try {
    signal?.throwIfAborted();
    const client = acquired.client;
    const directory = resolveOpenCode2SessionDirectory(location);
    const locationInput = { directory };

    let abortProbe: (() => void) | undefined;
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortProbe = () =>
            reject(signal.reason ?? new Error("OpenCode 2 inventory probe aborted"));
          signal.addEventListener("abort", abortProbe, { once: true });
          if (signal.aborted) abortProbe();
        })
      : undefined;

    const inventoryPromise = (async () => {
      await raceWithTimeout(
        client.plugin.awaitActivation({ location: locationInput }),
        OPENCODE2_ACTIVATION_TIMEOUT_MS,
        "OpenCode 2 plugin activation timed out",
      );
      signal?.throwIfAborted();
      const [models, agents, providers, defaultModel, commands, skills, integrations] =
        await raceWithTimeout(
          Promise.all([
            client.model.list({ location: locationInput }),
            client.agent.list({ location: locationInput }),
            client.provider.list({ location: locationInput }),
            client.model.default({ location: locationInput }),
            client.command.list({ location: locationInput }),
            client.skill.list({ location: locationInput }),
            client.integration.list({ location: locationInput }),
          ]),
          OPENCODE2_CATALOG_TIMEOUT_MS,
          "OpenCode 2 catalog probe timed out",
        );

      return {
        commands: [
          ...mapOpenCode2Commands(commands.data),
          ...mapOpenCode2Skills(skills.data, directory),
          ...mapOpenCode2Agents(agents.data),
        ],
        models: models.data
          .filter((model) => model.enabled)
          .map((model) => {
            const id = `${model.providerID}/${model.id}`;
            const name = model.name.trim();
            const contextLimit = model.limit.context;
            return {
              id,
              label: name.length > 0 ? name : id,
              variants: model.variants.map((variant) => variant.id),
              ...(Number.isFinite(contextLimit) && contextLimit > 0
                ? { contextLimit: Math.trunc(contextLimit) }
                : {}),
            };
          }),
        providers: providers.data.map((provider) => ({ id: provider.id, name: provider.name })),
        integrations: readOpenCode2Integrations(integrations.data),
        agents: agents.data.map((agent) => ({
          id: agent.id,
          mode: agent.mode,
          hidden: agent.hidden,
        })),
        defaultModel: defaultModel.data
          ? { providerID: defaultModel.data.providerID, id: defaultModel.data.id }
          : undefined,
      } satisfies OpenCode2Inventory;
    })();

    return await Promise.race([inventoryPromise, ...(abortPromise ? [abortPromise] : [])]).finally(
      () => {
        if (abortProbe) signal?.removeEventListener("abort", abortProbe);
      },
    );
  } finally {
    await acquired.dispose({ closeServerIfIdle: true });
  }
}

interface OpenCode2DetectionProbeResult {
  capabilities?: Partial<AgentCapability>;
  status?: StatusProbeResult;
}

type OpenCode2DetectionProbeContext = Parameters<
  NonNullable<DetectionSpec["capabilitiesProbe"]>
>[0];

interface PendingOpenCode2DetectionProbe {
  signal: AbortSignal | undefined;
  promise: Promise<OpenCode2DetectionProbeResult>;
}

const pendingOpenCode2DetectionProbes = new Map<string, PendingOpenCode2DetectionProbe>();

function openCode2DetectionProbeKey(ctx: OpenCode2DetectionProbeContext): string {
  return JSON.stringify([ctx.location, ctx.executablePath, ctx.version, ctx.probeEnv]);
}

async function runOpenCode2DetectionProbe(
  ctx: OpenCode2DetectionProbeContext,
): Promise<OpenCode2DetectionProbeResult> {
  if (!ctx.executablePath) return {};

  try {
    const inventory = await probeOpenCode2Inventory(ctx.location, ctx.signal);
    return {
      capabilities: buildOpenCode2CapabilityPartialFromInventory(inventory),
      status: buildOpenCode2StatusFromIntegrations(inventory.integrations),
    };
  } catch (cause) {
    // No CLI fallback exists for V2 — keep the default capability set so the
    // provider stays launchable (models/efforts just stay empty).
    console.warn(
      `[opencode2] capabilities probe failed, keeping default capabilities: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return {};
  }
}

function probeOpenCode2Detection(
  ctx: OpenCode2DetectionProbeContext,
): Promise<OpenCode2DetectionProbeResult> {
  const key = openCode2DetectionProbeKey(ctx);
  const existing = pendingOpenCode2DetectionProbes.get(key);
  if (existing && existing.signal === ctx.signal) return existing.promise;

  const pending = runOpenCode2DetectionProbe(ctx);
  pendingOpenCode2DetectionProbes.set(key, { signal: ctx.signal, promise: pending });
  const clearPending = () => {
    if (pendingOpenCode2DetectionProbes.get(key)?.promise === pending) {
      pendingOpenCode2DetectionProbes.delete(key);
    }
  };
  void pending.then(clearPending, clearPending);
  return pending;
}

// 2.0.0 (and beta 19500+) introduced the per-session permission contract.
export const openCode2DetectionSpec: DetectionSpec = {
  kind: "opencode2",
  label: "OpenCode 2",
  binary: "opencode2",
  versionArgs: ["--version"],
  baseSpawnEnv: OPENCODE2_ENV,
  async versionProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const result = await readAgentCommandOutput(ctx.location, ctx.executablePath, ["--version"], {
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
    });
    return result.ok ? parseOpenCode2Version(result.stdout) : undefined;
  },
  loginCommand: (ctx) =>
    ctx.executablePath
      ? `${ctx.location.kind === "windows" ? "& " + quotePowerShellLiteral(ctx.executablePath) : quotePosixShellArg(ctx.executablePath)} auth login`
      : undefined,
  capabilities: opencode2DefaultCapabilities,
  update: {
    installer: {
      posix: {
        binary: "sh",
        args: ["-c", 'npm install --prefix "$HOME/.opencode2" @opencode/cli@2.0.0'],
      },
      windows: {
        binary: "powershell.exe",
        args: [
          "-NoProfile",
          "-Command",
          'npm install --prefix "$env:USERPROFILE/.opencode2" @opencode/cli@2.0.0',
        ],
      },
    },
    latestVersionUrls: ["https://registry.npmjs.org/@opencode%2Fcli/latest"],
  },
  // The server knows which upstream AI providers hold credentials, so it — not
  // the shared auth.json — is the source of truth when it answers. The file
  // probe below stays as the fallback for when the server cannot be reached.
  statusProbe: async (ctx) => (await probeOpenCode2Detection(ctx)).status,
  authProbes: [
    // Auth file lives on the host and is shared with OpenCode 1; for WSL
    // projects we report "unknown" (`undefined` skips the probe) because the
    // WSL distro keeps its own copy under `$HOME/.local/share/opencode/auth.json`.
    configFileAuthProbe((loc) => (loc.kind === "wsl" ? undefined : opencode2NativeAuthPath())),
  ],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath || !supportsOpenCode2Version(ctx.version)) return undefined;
    return (await probeOpenCode2Detection(ctx)).capabilities;
  },
};
