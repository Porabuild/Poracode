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
import { findThoughtLevelConfigOption } from "./thoughtLevel";
import { filterAcpStdoutNonJsonLines } from "./sessionStreamFilter";
import {
  readUnstableInitializeModels,
  readUnstableSessionModels,
  type UnstableModelInfo,
  type UnstableSessionModelState,
} from "./unstableModelCompat";

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
  /** Per-model default thought level, read while the sweep has that model active. */
  modelDefaultEfforts?: Record<string, string>;
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
/**
 * Grace period for the agent to push `available_commands_update` after
 * `newSession` resolves. Some agents (qoder) deliver the initial command list
 * a few hundred ms after the response instead of before it.
 */
const INITIAL_SLASH_COMMANDS_TIMEOUT_MS = 2_000;

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
  // Kimi's `auto` mode (auto-approve safe operations) and Qwen's `auto`
  // approval policy share the canonical `auto` policy id.
  auto: { mode: "agent", approvalPolicyId: "auto" },
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
  const option = findThoughtLevelConfigOption(configOptions);

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
  modelDefaultEfforts: Record<string, string>,
): void {
  const thoughtLevels = mapAcpThoughtLevels(configOptions);
  // The selector's currentValue while this model is active is its default —
  // record it even when the effort list matches the provider baseline, since
  // models sharing one list can still default to different levels (Kimi's
  // highspeed defaults to low while K3 defaults higher).
  if (thoughtLevels.defaultEffort) {
    modelDefaultEfforts[modelId] = thoughtLevels.defaultEffort;
  }
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
): { promise: Promise<unknown[] | undefined>; cancel: () => void } {
  let waiter: ((configOptions: unknown[] | undefined) => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<unknown[] | undefined>((resolve) => {
    waiter = (configOptions: unknown[] | undefined) => {
      if (timer) clearTimeout(timer);
      resolve(configOptions);
    };
    timer = setTimeout(() => {
      const index = waiter ? waiters.indexOf(waiter) : -1;
      if (index >= 0) waiters.splice(index, 1);
      resolve(undefined);
    }, timeoutMs);
    waiters.push(waiter);
  });
  return {
    promise,
    cancel: () => {
      if (timer) clearTimeout(timer);
      const index = waiter ? waiters.indexOf(waiter) : -1;
      if (index >= 0) waiters.splice(index, 1);
    },
  };
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
    signal?: AbortSignal;
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
  const deadline = Date.now() + timeoutMs;
  const tag = options?.label ? `[acp-probe:${options.label}]` : "[acp-probe]";
  let child: ReturnType<typeof spawn> | undefined;
  let abortProbe: (() => void) | undefined;
  const ownedProcessGroup = process.platform !== "win32";
  const probeResult: AcpProbeResult = {};

  if (options?.signal?.aborted) return undefined;

  try {
    const configOptionsWaiters: Array<(configOptions: unknown[] | undefined) => void> = [];
    let latestSlashCommands: AgentSlashCommand[] | undefined;
    let initializeModels: UnstableSessionModelState | undefined;
    const rememberSlashCommands = (commands: AgentSlashCommand[] | undefined) => {
      latestSlashCommands = commands;
    };

    child = spawn(command, args, {
      cwd: options?.processCwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
      windowsHide: true,
      detached: ownedProcessGroup,
    });

    let childExited = false;
    const childClosed = new Promise<void>((resolve) => {
      const markClosed = () => {
        childExited = true;
        resolve();
      };
      child!.once("error", markClosed);
      child!.once("exit", markClosed);
    });
    abortProbe = () => {
      try {
        child?.stdin?.destroy();
      } catch {
        // Ignore cleanup races.
      }
      if (child) terminateChildProcessTree(child, { ownedProcessGroup });
    };
    options?.signal?.addEventListener("abort", abortProbe, { once: true });
    if (options?.signal?.aborted) abortProbe();
    const remainingBudgetMs = () => Math.max(0, deadline - Date.now());
    const waitForProbeWindow = async (maxMs: number): Promise<void> => {
      const waitMs = Math.min(maxMs, remainingBudgetMs());
      if (waitMs <= 0 || childExited) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, waitMs);
          }),
          childClosed,
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const runWithinProbeBudget = async <T>(operation: Promise<T>, maxMs?: number): Promise<T> => {
      const budgetMs = Math.min(maxMs ?? Number.POSITIVE_INFINITY, remainingBudgetMs());
      if (budgetMs <= 0) throw new Error("ACP probe timed out");
      if (childExited) throw new Error("ACP agent exited during capability probe");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("ACP probe timed out")), budgetMs);
          }),
          childClosed.then<never>(() => {
            throw new Error("ACP agent exited during capability probe");
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

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
    const stream = ndJsonStream(toAgent, filterAcpStdoutNonJsonLines(fromAgent));

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

    const result = await runWithinProbeBudget(
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
          initializeModels = readUnstableInitializeModels(initResult._meta);
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
    );
    // An available-commands update is a full snapshot. Keep the latest one
    // throughout the grace window because agents may publish built-ins first
    // and append skills after their async discovery completes.
    await waitForProbeWindow(INITIAL_SLASH_COMMANDS_TIMEOUT_MS);
    if (latestSlashCommands !== undefined) {
      probeResult.slashCommands = latestSlashCommands;
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
    // Unstable pre-1.0 model list (see unstableModelCompat.ts). Cursor exposes
    // it on session/new while Grok 0.2.x exposes it on initialize._meta. Read
    // only after newSession succeeds so a cached initialize list cannot make a
    // signed-out agent appear usable. `configOptions` "model" stays primary.
    const unstableModels = readUnstableSessionModels(result) ?? initializeModels;
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
      const modelConfig = findSelectConfigOption(result.configOptions, "model");
      // Probe per-model thought levels even when the default model exposes
      // none — some agents (qoder) only advertise a reasoning-effort selector
      // after switching to a reasoning-capable model.
      if (probeResult.models?.length && result.sessionId && modelConfig?.id) {
        const currentModel =
          typeof modelConfig?.currentValue === "string" ? modelConfig.currentValue : undefined;
        const modelEfforts: Record<string, string[]> = {};
        const modelDefaultEfforts: Record<string, string> = {};
        if (currentModel) {
          rememberModelThoughtLevels(
            currentModel,
            result.configOptions,
            probeResult.efforts ?? [],
            modelEfforts,
            modelDefaultEfforts,
          );
        }
        const modelIds = probeResult.models
          .map((model) => model.id)
          .filter((modelId) => modelId !== currentModel)
          .slice(0, MAX_MODEL_THOUGHT_LEVEL_PROBES);
        for (const modelId of modelIds) {
          if (remainingBudgetMs() <= 0 || childExited) break;
          const configOptionsUpdate = nextConfigOptionsUpdate(
            configOptionsWaiters,
            Math.min(MODEL_THOUGHT_LEVEL_PROBE_TIMEOUT_MS, remainingBudgetMs()),
          );
          let returnedConfigOptions: unknown[] | undefined;
          try {
            const setResult = await runWithinProbeBudget(
              connection.setSessionConfigOption({
                sessionId: result.sessionId,
                configId: modelConfig.id,
                value: modelId,
              }),
              MODEL_THOUGHT_LEVEL_PROBE_TIMEOUT_MS,
            );
            returnedConfigOptions = readConfigOptions(setResult);
          } catch {
            if (remainingBudgetMs() <= 0 || childExited) {
              configOptionsUpdate.cancel();
              break;
            }
            const notifiedConfigOptions = await configOptionsUpdate.promise;
            if (notifiedConfigOptions) {
              returnedConfigOptions = notifiedConfigOptions;
            }
            // No baseline yet means the method is likely unsupported — retrying
            // per model would just stall the probe.
            if (!returnedConfigOptions && !probeResult.efforts?.length) {
              break;
            }
            if (!returnedConfigOptions) continue;
          }
          const configOptions = returnedConfigOptions ?? (await configOptionsUpdate.promise);
          configOptionsUpdate.cancel();
          if (!configOptions) {
            break;
          }
          // Adopt the first discovered thought-level selector as the baseline.
          if (!probeResult.efforts?.length) {
            const discovered = mapAcpThoughtLevels(configOptions);
            if (discovered.efforts.length > 0) {
              probeResult.efforts = discovered.efforts;
              if (discovered.defaultEffort) {
                probeResult.defaultEffort = discovered.defaultEffort;
              }
            }
          }
          rememberModelThoughtLevels(
            modelId,
            configOptions,
            probeResult.efforts ?? [],
            modelEfforts,
            modelDefaultEfforts,
          );
        }
        if (Object.keys(modelEfforts).length > 0) {
          probeResult.modelEfforts = modelEfforts;
        }
        if (Object.keys(modelDefaultEfforts).length > 0) {
          probeResult.modelDefaultEfforts = modelDefaultEfforts;
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
    if (abortProbe) options?.signal?.removeEventListener("abort", abortProbe);
    if (child && !child.killed) {
      // Destroy stdin before killing to prevent the ACP SDK from writing
      // to a dead pipe (which causes noisy "ACP write error" logs).
      try {
        child.stdin?.destroy();
      } catch {
        /* ignore */
      }
      terminateChildProcessTree(child, { ownedProcessGroup });
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
          ndJsonStream(toAgent, filterAcpStdoutNonJsonLines(fromAgent)),
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
          ndJsonStream(toAgent, filterAcpStdoutNonJsonLines(fromAgent)),
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
