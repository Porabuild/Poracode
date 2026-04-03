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
  modes?: ThreadMode[];
  approvalPolicies?: Array<{ id: string; label: string }>;
}

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
};

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
    const mapped = MODE_MAP[acpMode.id];
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
  const timeoutMs = options?.timeoutMs ?? 8_000;
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
        await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "lightcode-probe", version: "0.1.0" },
          clientCapabilities: {},
        });
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
    if (result.modes?.availableModes?.length) {
      const mapped = mapAcpModes(result.modes.availableModes);
      if (mapped.modes.length) probeResult.modes = mapped.modes;
      if (mapped.approvalPolicies.length) probeResult.approvalPolicies = mapped.approvalPolicies;
    }

    console.log(
      "%s success — models: %d, modes: %s, approvalPolicies: %s (raw ACP modes: %s)",
      tag,
      probeResult.models?.length ?? 0,
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
      child.kill();
    }
  }
}
