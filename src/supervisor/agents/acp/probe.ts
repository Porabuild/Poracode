/**
 * Lightweight ACP capability probe.
 *
 * Spawns an ACP-mode agent process, performs the protocol handshake +
 * `newSession()` to discover available models and modes, then kills
 * the process. Falls back gracefully on any failure.
 *
 * Provider-agnostic — any agent that supports `--acp` can use this.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type Client,
  type AuthMethod,
  type SessionNotification,
  type SessionMode,
} from "@agentclientprotocol/sdk";
import type { AgentSlashCommand, AuthState, ThreadMode } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { readUnstableSessionModels, type UnstableModelInfo } from "./unstableModelCompat";

const ACP_AUTH_REQUIRED_ERROR = RequestError.authRequired();

function isAcpAuthRequiredError(error: unknown): boolean {
  if (error instanceof RequestError) {
    return (
      error.code === ACP_AUTH_REQUIRED_ERROR.code &&
      error.message.startsWith(ACP_AUTH_REQUIRED_ERROR.message)
    );
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const candidate = error as { code: unknown; message?: unknown };
    return (
      candidate.code === ACP_AUTH_REQUIRED_ERROR.code &&
      typeof candidate.message === "string" &&
      candidate.message.startsWith(ACP_AUTH_REQUIRED_ERROR.message)
    );
  }
  return false;
}

// ── Types ────────────────────────────────────────────────────────

export interface AcpProbeResult {
  authMethods?: AuthMethod[];
  authLogoutSupported?: boolean;
  sessionEstablished?: boolean;
  /**
   * Auth state derived directly from the ACP handshake — `"authenticated"`
   * when `newSession` succeeded, `"missing"` when the agent returned the
   * `auth_required` JSON-RPC error (code -32000). Left undefined when the
   * probe couldn't decide (spawn / transport / non-auth errors), so callers
   * fall back to their own heuristics.
   */
  authState?: AuthState;
  models?: Array<{ id: string; label: string; description?: string; tooltipDescription?: string }>;
  modelMetadata?: Record<string, Record<string, unknown>>;
  /**
   * Raw `_meta` collected during the probe handshake, merged across the
   * `initialize`, `authenticate`, and `newSession` responses (later sources
   * win on key conflicts). Provider-specific — Grok returns identity fields
   * (`email`, `auth_mode`, `subscription_tier`) on its `authenticate`
   * response. Adapters translate this into `AgentProviderMetadata`.
   */
  acpMeta?: Record<string, unknown>;
  efforts?: string[];
  defaultEffort?: string;
  modelEfforts?: Record<string, string[]>;
  modes?: ThreadMode[];
  approvalPolicies?: Array<{ id: string; label: string }>;
  slashCommands?: AgentSlashCommand[];
}

type AcpConfigOptionLike = {
  id?: string;
  category?: string | null;
  type?: string;
  currentValue?: string;
  options?: unknown;
};

type AcpConfigSelectOptionLike = {
  value?: string;
  name?: string;
};

type AcpConfigSelectGroupLike = {
  options?: unknown;
};

type AcpAvailableCommandLike = {
  name?: string;
  description?: string | null;
  input?: {
    hint?: string | null;
  } | null;
};

const MODEL_THOUGHT_LEVEL_PROBE_TIMEOUT_MS = 300;
const MAX_MODEL_THOUGHT_LEVEL_PROBES = 40;

// ── Mode mapping ─────────────────────────────────────────────────

/**
 * Known ACP mode ID → Poracode mode + optional approval policy.
 *
 * This is the reverse of `resolveAcpMode()` in session.ts.
 */
/**
 * ACP mode ID → Poracode mode + optional approval policy ID.
 *
 * Labels come from the ACP `SessionMode.name` field, not hardcoded here.
 */
const MODE_MAP: Record<string, { mode: ThreadMode; approvalPolicyId?: string }> = {
  default: { mode: "agent", approvalPolicyId: "default" },
  autoEdit: { mode: "agent", approvalPolicyId: "auto_edit" },
  yolo: { mode: "agent", approvalPolicyId: "never" },
  plan: { mode: "plan" },
  agent: { mode: "agent" },
  autopilot: { mode: "agent", approvalPolicyId: "autopilot" },
};

export function normalizeAcpModeId(modeId: string): string {
  const base = modeId.includes("#") ? modeId.split("#").at(-1) : modeId.split("/").at(-1);
  return (base ?? modeId).trim();
}

/**
 * Map ACP `SessionMode[]` to Poracode modes and approval policies.
 * Labels are taken from ACP's `SessionMode.name`.
 */
export function mapAcpModes(availableModes: SessionMode[]): {
  modes: ThreadMode[];
  approvalPolicies: Array<{ id: string; label: string }>;
} {
  const modes = new Set<ThreadMode>();
  const approvalPolicies: Array<{ id: string; label: string }> = [];

  for (const acpMode of availableModes) {
    const normalizedModeId = normalizeAcpModeId(acpMode.id);
    const mapped = MODE_MAP[normalizedModeId];
    if (!mapped) {
      modes.add("agent");
      approvalPolicies.push({ id: normalizedModeId, label: acpMode.name });
      continue;
    }
    modes.add(mapped.mode);
    if (mapped.approvalPolicyId) {
      approvalPolicies.push({ id: mapped.approvalPolicyId, label: acpMode.name });
    }
  }

  return { modes: [...modes], approvalPolicies };
}

/**
 * Build a human-friendly label from a model ID when the ACP agent
 * returns `name` identical to `modelId` (e.g. "gemini-2.5-flash-lite").
 *
 * Strips the "gemini-" prefix and title-cases dash-separated segments.
 */
export function humanizeModelId(id: string): string {
  const stripped = id.replace(/^gemini-/, "");
  return stripped
    .split("-")
    .map((seg) => (seg.length <= 1 ? seg : seg[0]!.toUpperCase() + seg.slice(1)))
    .join(" ");
}

/**
 * Map the unstable ACP model list (pre-1.0 `ModelInfo[]`, see
 * `unstableModelCompat.ts`) to Poracode model options.
 *
 * If the agent returns `name` equal to `modelId`, we generate a
 * friendlier label from the ID.
 */
export function mapAcpModels(
  availableModels: UnstableModelInfo[],
): Array<{ id: string; label: string; description?: string }> {
  return availableModels.map((m) => {
    const description = m.description?.trim();
    return {
      id: m.modelId,
      label: m.name === m.modelId ? humanizeModelId(m.modelId) : m.name,
      ...(description ? { description } : {}),
    };
  });
}

/** Map the standard ACP model config option to Poracode model options. */
export function mapAcpConfigModels(configOptions: unknown): Array<{ id: string; label: string }> {
  const option = findSelectConfigOption(configOptions, "model");
  if (!option) return [];

  return flattenSelectOptions(option.options).flatMap((entry) => {
    const id = typeof entry.value === "string" ? entry.value.trim() : "";
    if (!id) return [];
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    return [{ id, label: name && name !== id ? name : humanizeModelId(id) }];
  });
}

function mapAcpModelMetadata(
  availableModels: UnstableModelInfo[],
): Record<string, Record<string, unknown>> {
  const metadata: Record<string, Record<string, unknown>> = {};
  for (const model of availableModels) {
    if (typeof model._meta === "object" && model._meta !== null) {
      metadata[model.modelId] = model._meta;
    }
  }
  return metadata;
}

export function mapAcpSlashCommands(commands: AcpAvailableCommandLike[]): AgentSlashCommand[] {
  return commands.flatMap((command) => {
    const name = command.name?.trim();
    if (!name) {
      return [];
    }
    const skillName = name.toLowerCase().startsWith("skill:")
      ? name.slice("skill:".length).trim()
      : undefined;
    return [
      {
        id: name,
        label: command.description?.trim() ? `${name} — ${command.description}` : name,
        ...(command.description?.trim() ? { description: command.description } : {}),
        ...(command.input?.hint?.trim() ? { argumentHint: command.input.hint } : {}),
        ...(skillName ? { section: "skills" as const, skillName } : {}),
      },
    ];
  });
}

function isSelectOption(value: unknown): value is AcpConfigSelectOptionLike {
  return typeof value === "object" && value !== null && "value" in value;
}

function flattenSelectOptions(options: unknown): AcpConfigSelectOptionLike[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((entry) => {
    if (isSelectOption(entry)) {
      return [entry];
    }
    if (typeof entry === "object" && entry !== null && "options" in entry) {
      return flattenSelectOptions((entry as AcpConfigSelectGroupLike).options);
    }
    return [];
  });
}

function findSelectConfigOption(
  configOptions: unknown,
  category: string,
): AcpConfigOptionLike | undefined {
  if (!Array.isArray(configOptions)) {
    return undefined;
  }

  return configOptions.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }
    const configOption = candidate as AcpConfigOptionLike;
    return configOption.category === category && configOption.type === "select";
  }) as AcpConfigOptionLike | undefined;
}

export function mapAcpThoughtLevels(configOptions: unknown): {
  efforts: string[];
  defaultEffort?: string;
} {
  const option = findSelectConfigOption(configOptions, "thought_level");

  if (!option) {
    return { efforts: [] };
  }

  const efforts = flattenSelectOptions(option.options)
    .map((entry) => entry.value)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const defaultEffort =
    typeof option.currentValue === "string" && option.currentValue.length > 0
      ? option.currentValue
      : undefined;

  return {
    efforts,
    ...(defaultEffort ? { defaultEffort } : {}),
  };
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function rememberModelThoughtLevels(
  modelId: string,
  configOptions: unknown,
  fallbackEfforts: string[],
  modelEfforts: Record<string, string[]>,
): void {
  const thoughtLevels = mapAcpThoughtLevels(configOptions);
  if (
    thoughtLevels.efforts.length === 0 ||
    sameStringList(thoughtLevels.efforts, fallbackEfforts)
  ) {
    return;
  }
  modelEfforts[modelId] = thoughtLevels.efforts;
}

function readConfigOptions(value: unknown): unknown[] | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const configOptions = (value as { configOptions?: unknown }).configOptions;
  return Array.isArray(configOptions) ? configOptions : undefined;
}

function nextConfigOptionsUpdate(
  waiters: Array<(configOptions: unknown[] | undefined) => void>,
  timeoutMs: number,
): Promise<unknown[] | undefined> {
  return new Promise((resolve) => {
    const waiter = (configOptions: unknown[] | undefined) => {
      clearTimeout(timer);
      resolve(configOptions);
    };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      resolve(undefined);
    }, timeoutMs);
    waiters.push(waiter);
  });
}

// ── Probe ────────────────────────────────────────────────────────

/**
 * Spawn an ACP agent, discover its capabilities, then kill it.
 *
 * Returns `undefined` on any failure (timeout, missing --acp support,
 * protocol error, etc.).
 */
export async function probeAcpCapabilities(
  command: string,
  args: string[],
  sessionCwd: string,
  options?: {
    processCwd?: string;
    timeoutMs?: number;
    label?: string;
    env?: Record<string, string>;
    /**
     * Auth method IDs to call `authenticate` with (in order) after `initialize`
     * but before `newSession`. Stops at the first one advertised by the agent.
     * Used to retrieve identity metadata from agents that return it via the
     * authenticate response (e.g. Grok returns email/plan in `_meta` there).
     * Only safe for non-interactive flows like `cached_token` — never pass IDs
     * that trigger browser OAuth.
     */
    authenticateMethodIds?: readonly string[];
  },
): Promise<AcpProbeResult | undefined> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const tag = options?.label ? `[acp-probe:${options.label}]` : "[acp-probe]";
  let child: ReturnType<typeof spawn> | undefined;
  const probeResult: AcpProbeResult = {};

  try {
    const configOptionsWaiters: Array<(configOptions: unknown[] | undefined) => void> = [];
    let latestSlashCommands: AgentSlashCommand[] | undefined;
    let resolveInitialSlashCommands:
      | ((commands: AgentSlashCommand[] | undefined) => void)
      | undefined;
    let initialSlashCommandsResolved = false;
    const initialSlashCommands = new Promise<AgentSlashCommand[] | undefined>((resolve) => {
      resolveInitialSlashCommands = resolve;
    });
    const rememberSlashCommands = (commands: AgentSlashCommand[] | undefined) => {
      latestSlashCommands = commands;
      if (!initialSlashCommandsResolved) {
        initialSlashCommandsResolved = true;
        resolveInitialSlashCommands?.(commands);
      }
    };

    child = spawn(command, args, {
      cwd: options?.processCwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
      windowsHide: true,
    });

    // Bail early if the process fails to start
    const spawnError = await new Promise<Error | undefined>((resolve) => {
      child!.once("error", (err) => resolve(err));
      // If no error fires in the next tick, the process started fine
      setImmediate(() => resolve(undefined));
    });
    if (spawnError) {
      console.log("%s failed to spawn: %s", tag, spawnError.message);
      return undefined;
    }

    const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
    const fromAgent = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(toAgent, fromAgent);

    const connection = new ClientSideConnection(
      () => ({
        requestPermission: () => Promise.resolve({ outcome: { outcome: "cancelled" as const } }),
        sessionUpdate: (params: SessionNotification) => {
          if (params.update.sessionUpdate === "available_commands_update") {
            rememberSlashCommands(mapAcpSlashCommands(params.update.availableCommands));
          }
          if (
            params.update.sessionUpdate === "config_option_update" &&
            Array.isArray(params.update.configOptions)
          ) {
            const waiters = configOptionsWaiters.splice(0);
            for (const waiter of waiters) waiter(params.update.configOptions);
          }
          return Promise.resolve();
        },
        extNotification: () => Promise.resolve(),
      }),
      stream,
    );

    const result = await Promise.race([
      (async () => {
        const initResult = await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "poracode-probe", version: "0.1.0" },
          clientCapabilities: { auth: { terminal: true } },
        });
        if (initResult.authMethods?.length) {
          probeResult.authMethods = initResult.authMethods;
        }
        if (initResult.agentCapabilities?.auth?.logout !== undefined) {
          probeResult.authLogoutSupported = true;
        }
        if (initResult._meta && typeof initResult._meta === "object") {
          probeResult.acpMeta = initResult._meta as Record<string, unknown>;
        }

        // Non-spec compatibility fallback for agents that still expose
        // commands during initialize instead of session/update.
        const rawCommands = (initResult as { commands?: AcpAvailableCommandLike[] }).commands;
        if (Array.isArray(rawCommands) && rawCommands.length > 0) {
          latestSlashCommands = mapAcpSlashCommands(rawCommands);
        }

        const preferredAuthMethodId = options?.authenticateMethodIds?.find((id) =>
          initResult.authMethods?.some((method) => method.id === id),
        );
        if (preferredAuthMethodId) {
          try {
            const authResult = (await connection.authenticate({
              methodId: preferredAuthMethodId,
            })) as { _meta?: unknown } | undefined;
            const authMeta = authResult?._meta;
            if (authMeta && typeof authMeta === "object") {
              probeResult.acpMeta = {
                ...(probeResult.acpMeta ?? {}),
                ...(authMeta as Record<string, unknown>),
              };
            }
          } catch (err) {
            console.log(
              "%s authenticate(%s) failed: %s",
              tag,
              preferredAuthMethodId,
              err instanceof Error ? err.message : String(err),
            );
          }
        }

        try {
          return await connection.newSession({ cwd: sessionCwd, mcpServers: [] });
        } catch (err) {
          // ACP's spec-compliant signal that the agent is not signed in.
          // Propagate it as a distinct authState so the detection layer can
          // surface "missing" without falling back to env-var / file probes
          // that don't reflect post-logout state.
          if (isAcpAuthRequiredError(err)) {
            probeResult.authState = "missing";
          }
          throw err;
        }
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ACP probe timed out")), timeoutMs),
      ),
    ]);
    const initialCommandUpdate = await Promise.race([
      initialSlashCommands,
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), 250);
      }),
    ]);
    const resolvedSlashCommands = initialCommandUpdate ?? latestSlashCommands;
    if (resolvedSlashCommands !== undefined) {
      probeResult.slashCommands = resolvedSlashCommands;
    }

    probeResult.sessionEstablished = true;
    probeResult.authState = "authenticated";
    const newSessionMeta = (result as { _meta?: unknown })._meta;
    if (newSessionMeta && typeof newSessionMeta === "object") {
      probeResult.acpMeta = {
        ...(probeResult.acpMeta ?? {}),
        ...(newSessionMeta as Record<string, unknown>),
      };
    }
    // Unstable pre-1.0 model list (see unstableModelCompat.ts). Read after the
    // handshake so agents that only speak the removed surface (cursor-agent)
    // still surface their models; `configOptions` "model" stays primary below.
    const unstableModels = readUnstableSessionModels(result);
    if (unstableModels?.availableModels.length) {
      probeResult.models = mapAcpModels(unstableModels.availableModels);
      const modelMetadata = mapAcpModelMetadata(unstableModels.availableModels);
      if (Object.keys(modelMetadata).length > 0) {
        probeResult.modelMetadata = modelMetadata;
      }
    }
    if (result.configOptions?.length) {
      const configModels = mapAcpConfigModels(result.configOptions);
      if (configModels.length > 0) {
        probeResult.models = configModels;
      }
      const thoughtLevels = mapAcpThoughtLevels(result.configOptions);
      if (thoughtLevels.efforts.length > 0) {
        probeResult.efforts = thoughtLevels.efforts;
      }
      if (thoughtLevels.defaultEffort) {
        probeResult.defaultEffort = thoughtLevels.defaultEffort;
      }
      if (probeResult.models?.length && probeResult.efforts?.length && result.sessionId) {
        const modelConfig = findSelectConfigOption(result.configOptions, "model");
        const currentModel =
          typeof modelConfig?.currentValue === "string" ? modelConfig.currentValue : undefined;
        if (modelConfig?.id) {
          const modelEfforts: Record<string, string[]> = {};
          if (currentModel) {
            rememberModelThoughtLevels(
              currentModel,
              result.configOptions,
              probeResult.efforts,
              modelEfforts,
            );
          }
          const modelIds = probeResult.models
            .map((model) => model.id)
            .filter((modelId) => modelId !== currentModel)
            .slice(0, MAX_MODEL_THOUGHT_LEVEL_PROBES);
          for (const modelId of modelIds) {
            const configOptionsUpdate = nextConfigOptionsUpdate(
              configOptionsWaiters,
              MODEL_THOUGHT_LEVEL_PROBE_TIMEOUT_MS,
            );
            let returnedConfigOptions: unknown[] | undefined;
            try {
              const setResult = await connection.setSessionConfigOption({
                sessionId: result.sessionId,
                configId: modelConfig.id,
                value: modelId,
              });
              returnedConfigOptions = readConfigOptions(setResult);
            } catch {
              await configOptionsUpdate;
              continue;
            }
            const configOptions = returnedConfigOptions ?? (await configOptionsUpdate);
            if (!configOptions) {
              break;
            }
            rememberModelThoughtLevels(modelId, configOptions, probeResult.efforts, modelEfforts);
          }
          if (Object.keys(modelEfforts).length > 0) {
            probeResult.modelEfforts = modelEfforts;
          }
        }
      }
    }
    if (result.modes?.availableModes?.length) {
      const mapped = mapAcpModes(result.modes.availableModes);
      if (mapped.modes.length) probeResult.modes = mapped.modes;
      if (mapped.approvalPolicies.length) probeResult.approvalPolicies = mapped.approvalPolicies;
    }

    return probeResult;
  } catch {
    if (Object.keys(probeResult).length > 0) {
      return probeResult;
    }
    return undefined;
  } finally {
    if (child && !child.killed) {
      // Destroy stdin before killing to prevent the ACP SDK from writing
      // to a dead pipe (which causes noisy "ACP write error" logs).
      try {
        child.stdin?.destroy();
      } catch {
        /* ignore */
      }
      terminateChildProcessTree(child);
    }
  }
}

export async function authenticateAcpAgent(
  command: string,
  args: string[],
  methodId: string,
  options?: {
    processCwd?: string;
    env?: Record<string, string>;
    label?: string;
    timeoutMs?: number;
  },
): Promise<void> {
  const tag = `[acp-auth:${options?.label ?? command}]`;
  const timeoutMs = options?.timeoutMs ?? 10 * 60_000;
  let child: ChildProcessWithoutNullStreams | undefined;

  try {
    child = spawn(command, args, {
      ...(options?.processCwd ? { cwd: options.processCwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", ...(options?.env ?? {}) },
      shell: false,
      windowsHide: true,
    });

    const spawnReady = new Promise<void>((resolve, reject) => {
      child?.on("error", (err) => reject(new Error(`ACP agent failed to start: ${err.message}`)));
      child?.on("spawn", resolve);
    });

    child.stderr.on("data", (chunk) => {
      console.log("%s stderr: %s", tag, String(chunk).trimEnd());
    });

    await Promise.race([
      (async () => {
        await spawnReady;
        const toAgent = Writable.toWeb(child!.stdin) as WritableStream<Uint8Array>;
        const fromAgent = Readable.toWeb(child!.stdout) as ReadableStream<Uint8Array>;
        const connection = new ClientSideConnection(
          (_agent): Client => ({
            requestPermission() {
              throw new Error("ACP auth did not request permission support.");
            },
            sessionUpdate() {
              return Promise.resolve();
            },
            extNotification() {
              return Promise.resolve();
            },
          }),
          ndJsonStream(toAgent, fromAgent),
        );
        const initResult = await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "poracode-auth", version: "0.1.0" },
        });
        if (!initResult.authMethods?.some((method) => method.id === methodId)) {
          throw new Error(`ACP auth method not found: ${methodId}`);
        }
        console.log("%s authenticating with method: %s", tag, methodId);
        await connection.authenticate({ methodId });
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ACP auth timed out")), timeoutMs),
      ),
    ]);
  } finally {
    if (child && !child.killed) {
      try {
        child.stdin?.destroy();
      } catch {
        /* ignore */
      }
      terminateChildProcessTree(child);
    }
  }
}

export async function logoutAcpAgent(
  command: string,
  args: string[],
  options?: {
    processCwd?: string;
    env?: Record<string, string>;
    label?: string;
    timeoutMs?: number;
  },
): Promise<void> {
  const tag = `[acp-logout:${options?.label ?? command}]`;
  const timeoutMs = options?.timeoutMs ?? 2 * 60_000;
  let child: ChildProcessWithoutNullStreams | undefined;

  try {
    child = spawn(command, args, {
      ...(options?.processCwd ? { cwd: options.processCwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", ...(options?.env ?? {}) },
      shell: false,
      windowsHide: true,
    });

    const spawnReady = new Promise<void>((resolve, reject) => {
      child?.on("error", (err) => reject(new Error(`ACP agent failed to start: ${err.message}`)));
      child?.on("spawn", resolve);
    });

    child.stderr.on("data", (chunk) => {
      console.log("%s stderr: %s", tag, String(chunk).trimEnd());
    });

    await Promise.race([
      (async () => {
        await spawnReady;
        const toAgent = Writable.toWeb(child!.stdin) as WritableStream<Uint8Array>;
        const fromAgent = Readable.toWeb(child!.stdout) as ReadableStream<Uint8Array>;
        const connection = new ClientSideConnection(
          (_agent): Client => ({
            requestPermission() {
              throw new Error("ACP logout did not request permission support.");
            },
            sessionUpdate() {
              return Promise.resolve();
            },
            extNotification() {
              return Promise.resolve();
            },
          }),
          ndJsonStream(toAgent, fromAgent),
        );
        const initResult = await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "poracode-auth", version: "0.1.0" },
        });
        if (initResult.agentCapabilities?.auth?.logout === undefined) {
          throw new Error("ACP logout is not supported by this agent.");
        }
        console.log("%s logging out", tag);
        await connection.logout({});
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ACP logout timed out")), timeoutMs),
      ),
    ]);
  } finally {
    if (child && !child.killed) {
      try {
        child.stdin?.destroy();
      } catch {
        /* ignore */
      }
      terminateChildProcessTree(child);
    }
  }
}
