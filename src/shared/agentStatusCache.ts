import { z } from "zod";
import { isAgentStatusCacheEntryCompatible } from "./agentStatusCacheRegistry";
import {
  agentCapabilitySchema,
  agentProviderMetadataSchema,
  agentSettingDefSchema,
  agentStatusSchema,
  type AgentStatus,
  type AgentStatusesResponse,
} from "./contracts/agent";

// The supervisor, passive owner inventory, and renderer migration share this
// codec. v67-v71 have compatible shapes; provider-owned policies invalidate only
// changed derivations. Older/future generations still refuse in full. v71 adds
// the optional workflow-mode capability fields; only Claude rows are re-probed.
// Provider-only changes advance the producer and provider policy together;
// incompatible shared changes also advance the minimum compatible generation.
export const STATUS_CACHE_VERSION = 71;
const MINIMUM_COMPATIBLE_STATUS_CACHE_VERSION = 67;

export interface AgentStatusCacheSnapshot {
  state: "available" | "missing" | "invalid" | "incompatible" | "unavailable";
  version: number | null;
  statuses: AgentStatusesResponse & { fromCache: boolean };
}

function migrateSettingDef(definition: Record<string, unknown>): Record<string, unknown> {
  if (definition.type === "toggle" || definition.type === "select") return definition;
  if (typeof definition.default === "boolean") {
    const env =
      typeof definition.envVar === "string"
        ? { [definition.envVar]: "1" }
        : typeof definition.env === "object" && definition.env !== null
          ? definition.env
          : {};
    return { ...definition, type: "toggle", env };
  }
  return definition;
}

export const cachedAgentStatusSchema = agentStatusSchema.extend({
  capabilities: agentCapabilitySchema.extend({
    settingDefs: z.array(agentSettingDefSchema).catch([]),
  }),
});

function parseCachedStatuses(entries: unknown[] | undefined): AgentStatus[] {
  const results: AgentStatus[] = [];
  for (const entry of entries ?? []) {
    if (entry != null && typeof entry === "object") {
      const capabilities = (entry as Record<string, unknown>).capabilities;
      if (capabilities != null && typeof capabilities === "object") {
        const capRecord = capabilities as Record<string, unknown>;
        if (Array.isArray(capRecord.settingDefs))
          capRecord.settingDefs = capRecord.settingDefs.map((definition: unknown) =>
            definition != null && typeof definition === "object"
              ? migrateSettingDef(definition as Record<string, unknown>)
              : definition,
          );
      }
      const record = entry as Record<string, unknown>;
      if ("providerMetadata" in record) {
        const metadata = agentProviderMetadataSchema.safeParse(record.providerMetadata);
        if (metadata.success) record.providerMetadata = metadata.data;
        else delete record.providerMetadata;
      }
    }
    const parsed = cachedAgentStatusSchema.safeParse(entry);
    if (parsed.success) results.push(parsed.data);
  }
  return results;
}

/** Decode saved observations only; callers own file access and any discovery. */
export function decodeAgentStatusCache(cache: unknown): AgentStatusCacheSnapshot {
  const version = z.object({ version: z.number().int().positive() }).safeParse(cache);
  const empty = { windows: [], wsl: [], fromCache: false };
  if (!version.success) return { state: "invalid", version: null, statuses: empty };
  const sourceVersion = version.data.version;
  if (
    sourceVersion < MINIMUM_COMPATIBLE_STATUS_CACHE_VERSION ||
    sourceVersion > STATUS_CACHE_VERSION
  )
    return { state: "incompatible", version: version.data.version, statuses: empty };
  const parsed = z
    .object({
      windows: z.array(z.unknown()).optional(),
      wsl: z.array(z.unknown()).optional(),
    })
    .safeParse(cache);
  if (!parsed.success) return { state: "invalid", version: sourceVersion, statuses: empty };
  const windows = parseCachedStatuses(parsed.data.windows).filter(
    (status) => status.envKind !== "wsl",
  );
  const wsl = parseCachedStatuses(parsed.data.wsl)
    .filter((status) => status.envKind === undefined || status.envKind === "wsl")
    .map((status) =>
      status.envKind === undefined ? { ...status, envKind: "wsl" as const } : status,
    );
  const compatible = (status: AgentStatus) =>
    isAgentStatusCacheEntryCompatible(status.kind, sourceVersion);
  const acceptedWindows = windows.filter(compatible);
  const acceptedWsl = wsl.filter(compatible);
  return {
    state: "available",
    version: sourceVersion,
    statuses: {
      windows: acceptedWindows,
      wsl: acceptedWsl,
      // Retained rows are usable, but a partial inventory cannot complete
      // startup or authorize persisting a scoped subset as a complete sweep.
      fromCache: acceptedWindows.length === windows.length && acceptedWsl.length === wsl.length,
    },
  };
}
