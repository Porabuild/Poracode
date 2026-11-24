import { homedir } from "node:os";
import { join } from "node:path";
import { OPENCODE_PROVIDER_KIND } from "@/shared/agents/opencode";
import type { AgentCapability, AgentSlashCommand, ProjectLocation } from "@/shared/contracts";
import { sortEffortsByCanonicalOrder } from "@/shared/effortOrder";
import { configFileAuthProbe, readAgentCommandOutput, type DetectionSpec } from "../base";
import { quotePosixShellArg, quotePowerShellLiteral } from "../base/shellBasics";
import type { StatusProbeResult } from "../base/types";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { OPENCODE_MIN_VERSION, parseOpenCodeVersion, supportsOpenCodeVersion } from "./binary";
import { availableOpenCodeCatalog } from "./catalogAvailability";
import { acquireOpenCodeServer, resolveOpenCodeSessionDirectory } from "./client";
import { mapOpenCodeAgents, mapOpenCodeCommands, mapOpenCodeSkills } from "./commands";
import { readOpenCodeContextLimit } from "./model";
import {
  buildOpenCodeStatusFromIntegrations,
  readOpenCodeIntegrations,
  readOpenCodeLegacyProviders,
  type OpenCodeInventoryIntegration,
} from "./credentials";
import { awaitOpenCodeActivation } from "./readiness";

// Provider default for the default model's effort ladder. OpenCode Go's
// deepseek-v4.1-flash ships `low`/`high`/`max` and OpenCode's own default is
// the strongest tier.
const OPENCODE_PREFERRED_DEFAULT_EFFORT = "max";

export const opencodeDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  // OpenCode exposes the built-in `build` (default) and `plan` agents. The
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
  utilityRank: 71,
  supportsTextOnlyOneShot: true,
  reportsSkillCatalog: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "gui",
  // GUI presentation is the default and runs on the V2 HTTP server (long-lived
  // `opencode serve` + SSE stream); terminal mode reuses the same pooled
  // server for session-id allocation, dynamic MCP sync, and L1 status events.
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // Dynamic per-thread MCP toggles: enabled servers are registered on the
  // pooled directory client and isolated per session using session
  // permissions + _meta["ai.opencode/sessionID"].
  mcpScope: { terminal: "launch", gui: "always" },
  // Crossagents calls from pooled sessions are routed by the trusted
  // provider session id, so every directory/session shares one MCP credential.
  crossagentMcpRouting: "provider-session",
  settingDefs: [],
};

/**
 * OpenCode credentials live in `~/.local/share/opencode/auth.json` after
 * `opencode auth login`. Existence is good enough as an "authenticated" signal
 * — the host can't validate the token without spending a request.
 */
function opencodeNativeAuthPath(): string {
  return join(homedir(), ".local", "share", "opencode", "auth.json");
}

/** Per-model entry from the V2 catalog, normalised for the capability builder. */
export interface OpenCodeInventoryModel {
  /** Composite id the rest of Poracode keys models by: `${providerID}/${id}`. */
  id: string;
  /** Server-supplied display name; falls back to the composite id when empty. */
  label: string;
  variants: string[];
  contextLimit?: number;
}

/** Per-provider entry from the V2 provider catalog. */
export interface OpenCodeInventoryProvider {
  id: string;
  name: string;
}

/** Per-agent entry from the V2 agent catalog. */
export interface OpenCodeInventoryAgent {
  id: string;
  mode: "primary" | "subagent" | "all";
  hidden: boolean;
}

/** Aggregate catalog inventory returned by the V2 probe. */
export interface OpenCodeInventory {
  models: OpenCodeInventoryModel[];
  commands?: AgentSlashCommand[];
  providers: OpenCodeInventoryProvider[];
  /**
   * Upstream AI providers and the credentials stored for them. OpenCode
   * authenticates per provider, so this — not the provider catalog, which also
   * lists auto-activated providers — is what says who is signed in.
   */
  integrations: OpenCodeInventoryIntegration[];
  agents: OpenCodeInventoryAgent[];
  /** Server-configured default model, when the catalog reports one. */
  defaultModel?: { providerID: string; id: string } | undefined;
}

function defaultEffortFor(ordered: readonly string[]): { defaultEffort?: string } {
  if (ordered.includes(OPENCODE_PREFERRED_DEFAULT_EFFORT)) {
    return { defaultEffort: OPENCODE_PREFERRED_DEFAULT_EFFORT };
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
export function buildOpenCodeCapabilityPartialFromInventory(
  inventory: OpenCodeInventory,
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
const OPENCODE_ACTIVATION_TIMEOUT_MS = 60_000;
const OPENCODE_CATALOG_TIMEOUT_MS = 15_000;

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
export async function probeOpenCodeInventory(
  location: ProjectLocation,
  signal?: AbortSignal,
): Promise<OpenCodeInventory> {
  signal?.throwIfAborted();
  const acquired = await acquireOpenCodeServer({ projectLocation: location });

  try {
    signal?.throwIfAborted();
    const client = acquired.client;
    const directory = resolveOpenCodeSessionDirectory(location);
    const locationInput = { directory };

    let abortProbe: (() => void) | undefined;
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortProbe = () => reject(signal.reason ?? new Error("OpenCode inventory probe aborted"));
          signal.addEventListener("abort", abortProbe, { once: true });
          if (signal.aborted) abortProbe();
        })
      : undefined;

    const inventoryPromise = (async () => {
      await raceWithTimeout(
        awaitOpenCodeActivation(
          client,
          { location: locationInput },
          { ...(signal ? { signal } : {}) },
        ),
        OPENCODE_ACTIVATION_TIMEOUT_MS,
        "OpenCode plugin activation timed out",
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
          OPENCODE_CATALOG_TIMEOUT_MS,
          "OpenCode catalog probe timed out",
        );

      const available = availableOpenCodeCatalog(models.data, providers.data, integrations.data);

      return {
        commands: [
          ...mapOpenCodeCommands(commands.data),
          ...mapOpenCodeSkills(skills.data, directory),
          ...mapOpenCodeAgents(agents.data),
        ],
        models: available.models.map((model) => {
          const id = `${model.providerID}/${model.id}`;
          const name = model.name.trim();
          const contextLimit = readOpenCodeContextLimit(model);
          return {
            id,
            label: name.length > 0 ? name : id,
            variants: model.variants.map((variant) => variant.id),
            ...(contextLimit !== undefined ? { contextLimit } : {}),
          };
        }),
        providers: available.providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
        })),
        integrations: readOpenCodeIntegrations(integrations.data),
        agents: agents.data.map((agent) => ({
          id: agent.id,
          mode: agent.mode,
          hidden: agent.hidden,
        })),
        defaultModel:
          defaultModel.data &&
          available.models.some(
            (model) =>
              model.providerID === defaultModel.data?.providerID &&
              model.id === defaultModel.data?.id,
          )
            ? { providerID: defaultModel.data.providerID, id: defaultModel.data.id }
            : undefined,
      } satisfies OpenCodeInventory;
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

interface OpenCodeDetectionProbeResult {
  capabilities?: Partial<AgentCapability>;
  status?: StatusProbeResult;
}

type OpenCodeDetectionProbeContext = Parameters<NonNullable<DetectionSpec["capabilitiesProbe"]>>[0];

interface PendingOpenCodeDetectionProbe {
  signal: AbortSignal | undefined;
  promise: Promise<OpenCodeDetectionProbeResult>;
}

const pendingOpenCodeDetectionProbes = new Map<string, PendingOpenCodeDetectionProbe>();

function openCodeDetectionProbeKey(ctx: OpenCodeDetectionProbeContext): string {
  return JSON.stringify([ctx.location, ctx.executablePath, ctx.version, ctx.probeEnv]);
}

async function runOpenCodeDetectionProbe(
  ctx: OpenCodeDetectionProbeContext,
): Promise<OpenCodeDetectionProbeResult> {
  if (!ctx.executablePath) return {};

  try {
    const inventory = await probeOpenCodeInventory(ctx.location, ctx.signal);
    const legacyProviders = await readOpenCodeLegacyProviders(ctx.location, inventory.integrations);
    return {
      capabilities: buildOpenCodeCapabilityPartialFromInventory(inventory),
      status: buildOpenCodeStatusFromIntegrations(inventory.integrations, legacyProviders),
    };
  } catch (cause) {
    // No CLI fallback exists — keep the default capability set so the
    // provider stays launchable (models/efforts just stay empty).
    console.warn(
      `[opencode] capabilities probe failed, keeping default capabilities: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return {};
  }
}

function probeOpenCodeDetection(
  ctx: OpenCodeDetectionProbeContext,
): Promise<OpenCodeDetectionProbeResult> {
  const key = openCodeDetectionProbeKey(ctx);
  const existing = pendingOpenCodeDetectionProbes.get(key);
  if (existing && existing.signal === ctx.signal) return existing.promise;

  const pending = runOpenCodeDetectionProbe(ctx);
  pendingOpenCodeDetectionProbes.set(key, { signal: ctx.signal, promise: pending });
  const clearPending = () => {
    if (pendingOpenCodeDetectionProbes.get(key)?.promise === pending) {
      pendingOpenCodeDetectionProbes.delete(key);
    }
  };
  void pending.then(clearPending, clearPending);
  return pending;
}

// Keep installs inside the supported protocol major. Run only the package-owned
// setup explicitly: npm can succeed while its lifecycle policy leaves a stub.
// Verify the launcher so an incomplete install never reports update success.
export const openCodeDetectionSpec: DetectionSpec = {
  kind: OPENCODE_PROVIDER_KIND,
  label: "OpenCode",
  binary: "opencode",
  versionArgs: ["--version"],
  async versionProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const result = await readAgentCommandOutput(ctx.location, ctx.executablePath, ["--version"], {
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
    });
    return result.ok ? parseOpenCodeVersion(result.stdout) : undefined;
  },
  loginCommand: (ctx) =>
    ctx.executablePath
      ? `${ctx.location.kind === "windows" ? "& " + quotePowerShellLiteral(ctx.executablePath) : quotePosixShellArg(ctx.executablePath)} auth login`
      : undefined,
  capabilities: opencodeDefaultCapabilities,
  update: {
    installer: {
      posix: {
        binary: "sh",
        args: [
          "-c",
          `npm install --ignore-scripts --include=optional --prefix "$HOME/.opencode2" "@opencode/cli@^${OPENCODE_MIN_VERSION}" && npm --prefix "$HOME/.opencode2/node_modules/@opencode/cli" run postinstall && "$HOME/.opencode2/node_modules/@opencode/cli/bin/opencode.exe" --version`,
        ],
      },
      windows: {
        binary: "powershell.exe",
        args: [
          "-NoProfile",
          "-Command",
          `$ErrorActionPreference = "Stop"; npm install --ignore-scripts --include=optional --prefix "$env:USERPROFILE/.opencode2" "@opencode/cli@^${OPENCODE_MIN_VERSION}"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix "$env:USERPROFILE/.opencode2/node_modules/@opencode/cli" run postinstall; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & "$env:USERPROFILE/.opencode2/node_modules/@opencode/cli/bin/opencode.exe" --version; exit $LASTEXITCODE`,
        ],
      },
    },
    latestVersionUrls: ["https://registry.npmjs.org/@opencode%2Fcli/latest"],
  },
  // The server knows which upstream AI providers hold credentials, so it — not
  // the shared auth.json — is the source of truth when it answers. The file
  // probe below stays as the fallback for when the server cannot be reached.
  statusProbe: async (ctx) => (await probeOpenCodeDetection(ctx)).status,
  authProbes: [
    // Auth file lives on the host; for WSL projects we report "unknown"
    // (`undefined` skips the probe) because the WSL distro keeps its own copy
    // under `$HOME/.local/share/opencode/auth.json`.
    configFileAuthProbe((loc) => (loc.kind === "wsl" ? undefined : opencodeNativeAuthPath())),
  ],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath || !supportsOpenCodeVersion(ctx.version)) return undefined;
    return (await probeOpenCodeDetection(ctx)).capabilities;
  },
};
