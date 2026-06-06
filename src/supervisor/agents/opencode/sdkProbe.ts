/**
 * SDK-based capabilities probe.
 *
 * The CLI parser (`opencode models --verbose`) was the only way to enumerate
 * providers/models/variants before we started shipping the SDK runtime. Now
 * that every project ends up spawning `opencode serve` for the GUI / TUI
 * session allocation anyway, we may as well also use it for the one-time
 * inventory call. The SDK returns:
 *
 *   - per-provider model `name` (we no longer need slug-titleization heuristics
 *     for everything the API knows)
 *   - the `connected` provider list (filter to only models the user can
 *     actually call right now — matches what `opencode providers list` shows)
 *   - per-model `variants` keyed by id (same shape as the CLI parser)
 *   - per-model `limit.context` token counts (also same as the CLI)
 *   - the list of user-defined agents (kept around for future wiring; not
 *     currently surfaced anywhere)
 *
 * Falls back silently to the CLI parser when the server fails to start —
 * sandboxed binaries, missing libc, port-binding races, corporate firewalls,
 * etc. The caller logs the failure mode and degrades gracefully.
 */

import type { NonSshProjectLocation } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildOpenCodeServerCommand } from "./argv";
import { resolveOpenCodeSessionDirectory } from "./sdkClient";
import { spawnOpenCodeServer } from "./sdkServer";

/** Per-model entry returned by the SDK provider list, normalised. */
export interface OpenCodeSdkModel {
  id: string;
  /** Server-supplied display name; empty when the provider hasn't supplied one. */
  name: string;
  variants: string[];
  contextLimit?: number;
}

/** Per-provider grouping returned by the SDK provider list. */
export interface OpenCodeSdkProvider {
  id: string;
  /** Server-supplied display name; empty when the provider hasn't supplied one. */
  name: string;
  models: OpenCodeSdkModel[];
}

/** Single user-defined agent surfaced via `client.app.agents()`. */
export interface OpenCodeSdkAgent {
  name: string;
  mode: "primary" | "subagent" | "all" | "unknown";
  hidden: boolean;
}

/** Aggregate inventory returned by the SDK probe. */
export interface OpenCodeSdkInventory {
  providers: OpenCodeSdkProvider[];
  /** Provider ids reported as having a working upstream connection. */
  connected: string[];
  agents: OpenCodeSdkAgent[];
}

const PROBE_READY_GRACE_MS = 15_000;

interface ProviderListPayloadModel {
  id?: unknown;
  name?: unknown;
  variants?: unknown;
  limit?: { context?: unknown } | unknown;
}

interface ProviderListPayloadProvider {
  id?: unknown;
  name?: unknown;
  models?: unknown;
}

function normalizeProviderModel(raw: ProviderListPayloadModel): OpenCodeSdkModel | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return undefined;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const variants =
    raw.variants && typeof raw.variants === "object" && !Array.isArray(raw.variants)
      ? Object.keys(raw.variants as Record<string, unknown>)
      : [];
  const limit =
    raw.limit && typeof raw.limit === "object" ? (raw.limit as { context?: unknown }) : undefined;
  const rawContext = limit?.context;
  const contextLimit =
    typeof rawContext === "number" && Number.isFinite(rawContext) && rawContext > 0
      ? Math.trunc(rawContext)
      : undefined;
  return {
    id,
    name,
    variants,
    ...(contextLimit !== undefined ? { contextLimit } : {}),
  };
}

function normalizeProvider(raw: ProviderListPayloadProvider): OpenCodeSdkProvider | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return undefined;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const modelsBag =
    raw.models && typeof raw.models === "object" && !Array.isArray(raw.models)
      ? Object.values(raw.models as Record<string, ProviderListPayloadModel>)
      : Array.isArray(raw.models)
        ? (raw.models as ProviderListPayloadModel[])
        : [];
  const models: OpenCodeSdkModel[] = [];
  for (const candidate of modelsBag) {
    const normalized = normalizeProviderModel(candidate);
    if (normalized) models.push(normalized);
  }
  return { id, name, models };
}

function normalizeProviderListResponse(raw: unknown): {
  providers: OpenCodeSdkProvider[];
  connected: string[];
} {
  if (!raw || typeof raw !== "object") return { providers: [], connected: [] };
  const data = raw as { all?: unknown; connected?: unknown };
  const allList = Array.isArray(data.all) ? (data.all as ProviderListPayloadProvider[]) : [];
  const providers: OpenCodeSdkProvider[] = [];
  for (const candidate of allList) {
    const normalized = normalizeProvider(candidate);
    if (normalized) providers.push(normalized);
  }
  const connected = Array.isArray(data.connected)
    ? (data.connected as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  return { providers, connected };
}

function normalizeAgentsResponse(raw: unknown): OpenCodeSdkAgent[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenCodeSdkAgent[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const obj = candidate as { name?: unknown; mode?: unknown; hidden?: unknown };
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) continue;
    const mode =
      obj.mode === "primary" || obj.mode === "subagent" || obj.mode === "all"
        ? (obj.mode as "primary" | "subagent" | "all")
        : ("unknown" as const);
    const hidden = typeof obj.hidden === "boolean" ? obj.hidden : false;
    out.push({ name, mode, hidden });
  }
  return out;
}

/**
 * Spawn an ephemeral `opencode serve`, call `provider.list()` + `app.agents()`,
 * and tear the server back down. The returned promise rejects on any failure;
 * callers are expected to fall back to the CLI parser.
 */
export async function probeOpenCodeInventoryViaSdk(
  location: NonSshProjectLocation,
  executablePath: string,
): Promise<OpenCodeSdkInventory | undefined> {
  const resolvedExecPath = resolveAgentBinaryPath(location, executablePath);
  const command = buildOpenCodeServerCommand(location, resolvedExecPath);
  const handle = await spawnOpenCodeServer(command);

  let baseUrl: string;
  try {
    baseUrl = await Promise.race([
      handle.baseUrl,
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error(`opencode serve did not start within ${PROBE_READY_GRACE_MS}ms`)),
          PROBE_READY_GRACE_MS,
        ),
      ),
    ]);
  } catch (err) {
    await handle.dispose();
    throw err;
  }

  try {
    const { createOpencodeClient } = await import("@opencode-ai/sdk/v2/client");
    const client = createOpencodeClient({
      baseUrl,
      directory: resolveOpenCodeSessionDirectory(location),
      throwOnError: true,
    });

    const [providerListResult, agentsResult] = await Promise.all([
      client.provider.list().catch((err: unknown) => {
        throw new Error(
          `provider.list failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }),
      client.app.agents().catch((err: unknown) => {
        // Agents endpoint exists from 1.14.19 onwards. If a fork or older
        // build is missing it, we treat the agents list as empty rather than
        // failing the whole probe — the rest of the inventory is still useful.
        console.warn(
          `[opencode] app.agents probe failed (continuing without custom agents): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return { data: [] };
      }),
    ]);

    const providerPayload = (providerListResult as { data?: unknown }).data;
    const agentsPayload = (agentsResult as { data?: unknown }).data;
    const { providers, connected } = normalizeProviderListResponse(providerPayload);
    const agents = normalizeAgentsResponse(agentsPayload);
    return { providers, connected, agents };
  } finally {
    await handle.dispose();
  }
}
