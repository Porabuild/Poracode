/**
 * Lightweight ACP capability probe.
 *
 * Spawns an ACP-mode agent process, performs the protocol handshake +
 * `newSession()` to discover available models and modes, then kills
 * the process. Falls back gracefully on any failure.
 *
 * Provider-agnostic — any agent that supports `--acp` can use this.
 */

import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ModelInfo,
  type SessionMode,
} from "@agentclientprotocol/sdk";
import type { ThreadMode } from "../../../shared/contracts";

// ── Types ────────────────────────────────────────────────────────

export interface AcpProbeResult {
  models?: Array<{ id: string; label: string }>;
  efforts?: string[];
  defaultEffort?: string;
  modelEfforts?: Record<string, string[]>;
  modes?: ThreadMode[];
  approvalPolicies?: Array<{ id: string; label: string }>;
}

type AcpConfigOptionLike = {
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

// ── Mode mapping ─────────────────────────────────────────────────

/**
 * Known ACP mode ID → Lightcode mode + optional approval policy.
 *
 * This is the reverse of `resolveAcpMode()` in session.ts.
 */
/**
 * ACP mode ID → Lightcode mode + optional approval policy ID.
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
 * Map ACP `SessionMode[]` to Lightcode modes and approval policies.
 * Labels are taken from ACP's `SessionMode.name`.
 */
export function mapAcpModes(availableModes: SessionMode[]): {
  modes: ThreadMode[];
  approvalPolicies: Array<{ id: string; label: string }>;
} {
  const modes = new Set<ThreadMode>();
  const approvalPolicies: Array<{ id: string; label: string }> = [];

  for (const acpMode of availableModes) {
    const mapped = MODE_MAP[normalizeAcpModeId(acpMode.id)];
    if (!mapped) {
      console.log("[acp-probe] unknown mode ID, skipping:", acpMode.id);
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
 * Map ACP `ModelInfo[]` to Lightcode model options.
 *
 * If the agent returns `name` equal to `modelId`, we generate a
 * friendlier label from the ID.
 */
export function mapAcpModels(availableModels: ModelInfo[]): Array<{ id: string; label: string }> {
  return availableModels.map((m) => ({
    id: m.modelId,
    label: m.name === m.modelId ? humanizeModelId(m.modelId) : m.name,
  }));
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

export function mapAcpThoughtLevels(configOptions: unknown): {
  efforts: string[];
  defaultEffort?: string;
} {
  if (!Array.isArray(configOptions)) {
    return { efforts: [] };
  }

  const option = configOptions.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }
    const configOption = candidate as AcpConfigOptionLike;
    return configOption.category === "thought_level" && configOption.type === "select";
  }) as AcpConfigOptionLike | undefined;

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
  options?: { processCwd?: string; timeoutMs?: number; label?: string },
): Promise<AcpProbeResult | undefined> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const tag = options?.label ? `[acp-probe:${options.label}]` : "[acp-probe]";
  let child: ReturnType<typeof spawn> | undefined;

  try {
    child = spawn(command, args, {
      cwd: options?.processCwd,
      stdio: ["pipe", "pipe", "pipe"],
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
        sessionUpdate: () => Promise.resolve(),
      }),
      stream,
    );

    const result = await Promise.race([
      (async () => {
        const initResult = await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "lightcode-probe", version: "0.1.0" },
          clientCapabilities: {},
        });

        // Authenticate if the agent advertises auth methods (e.g. Cursor's cursor_login).
        const authMethods = initResult.authMethods;
        if (authMethods && authMethods.length > 0) {
          const firstMethod = authMethods[0]!;
          const methodId = "id" in firstMethod ? (firstMethod as { id: string }).id : undefined;
          if (methodId) {
            console.log("%s authenticating with method: %s", tag, methodId);
            await connection.authenticate({ methodId });
          }
        }

        return connection.newSession({ cwd: sessionCwd, mcpServers: [] });
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ACP probe timed out")), timeoutMs),
      ),
    ]);

    const probeResult: AcpProbeResult = {};

    if (result.models?.availableModels?.length) {
      probeResult.models = mapAcpModels(result.models.availableModels);
    }
    if (result.configOptions?.length) {
      const thoughtLevels = mapAcpThoughtLevels(result.configOptions);
      if (thoughtLevels.efforts.length > 0) {
        probeResult.efforts = thoughtLevels.efforts;
      }
      if (thoughtLevels.defaultEffort) {
        probeResult.defaultEffort = thoughtLevels.defaultEffort;
      }
    }
    if (result.modes?.availableModes?.length) {
      const mapped = mapAcpModes(result.modes.availableModes);
      if (mapped.modes.length) probeResult.modes = mapped.modes;
      if (mapped.approvalPolicies.length) probeResult.approvalPolicies = mapped.approvalPolicies;
    }

    console.log(
      "%s success — models: %d, efforts: %s, defaultEffort: %s, modes: %s, approvalPolicies: %s (raw ACP modes: %s)",
      tag,
      probeResult.models?.length ?? 0,
      probeResult.efforts?.join(", ") ?? "(none)",
      probeResult.defaultEffort ?? "(none)",
      probeResult.modes?.join(", ") ?? "(none)",
      probeResult.approvalPolicies?.map((p) => p.id).join(", ") ?? "(none)",
      result.modes?.availableModes?.map((m) => m.id).join(", ") ?? "(none)",
    );

    return probeResult;
  } catch (err) {
    console.log("%s failed: %s", tag, err instanceof Error ? err.message : err);
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
      child.kill();
    }
  }
}
