import type { AgentSlashCommand } from "@/shared/contracts";
import type { RemoteAgentStatuses } from "@/shared/remote/protocol";

/**
 * WS3-A lazy slash-command catalogs. The agent-statuses HTTP payload omits
 * the per-agent command catalogs (the dominant payload bulk — full skill
 * descriptions for every detected agent); this module caches the lazily
 * fetched catalog per (endpoint, kind). Status refreshes reload only catalogs
 * already requested by a composer. This cache is process-local; no persisted
 * or wire format changes when a refresh replaces its generation.
 */

const catalogs = new Map<string, AgentSlashCommand[]>();
const inFlight = new Map<string, Promise<AgentSlashCommand[]>>();
const requested = new Set<string>();
const generations = new Map<string, number>();

function key(desktopId: string, kind: string): string {
  return `${desktopId}\0${kind}`;
}

export function cachedSlashCommands(
  desktopId: string,
  kind: string,
): AgentSlashCommand[] | undefined {
  return catalogs.get(key(desktopId, kind));
}

/** Splices every cached catalog into a freshly fetched (command-less)
 * statuses payload so stored state stays composer-complete. */
export function applyCachedSlashCommandCatalogs(
  desktopId: string,
  statuses: RemoteAgentStatuses,
): RemoteAgentStatuses {
  const hasAny = catalogs.size > 0;
  const patch = (entries: RemoteAgentStatuses["windows"]): RemoteAgentStatuses["windows"] =>
    hasAny
      ? entries.map((entry) => {
          const commands = catalogs.get(key(desktopId, entry.kind));
          if (!commands || entry.capabilities.slashCommands !== undefined) return entry;
          return {
            ...entry,
            capabilities: { ...entry.capabilities, slashCommands: [...commands] },
          };
        })
      : entries;
  return { ...statuses, windows: patch(statuses.windows), wsl: patch(statuses.wsl) };
}

/** Fetches one agent's catalog until the next status refresh (concurrent
 * callers share the in-flight promise) for the caller to splice into state.
 * Failed commands are not cached; the requested kind is retried on refresh. */
export function fetchSlashCommandCatalog(
  desktopId: string,
  kind: string,
  fetch: () => Promise<AgentSlashCommand[]>,
): Promise<AgentSlashCommand[]> {
  const cacheKey = key(desktopId, kind);
  requested.add(cacheKey);
  const known = catalogs.get(cacheKey);
  if (known) return Promise.resolve(known);
  const cachedFetch = inFlight.get(cacheKey);
  if (cachedFetch) return cachedFetch;
  const generation = generations.get(desktopId) ?? 0;
  const pending = fetch()
    .then((commands) => {
      if ((generations.get(desktopId) ?? 0) === generation) catalogs.set(cacheKey, commands);
      return commands;
    })
    .finally(() => {
      if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, pending);
  return pending;
}

export async function refreshSlashCommandCatalogs(
  scope: string,
  statuses: RemoteAgentStatuses,
  fetch: (kind: string) => Promise<AgentSlashCommand[]>,
): Promise<RemoteAgentStatuses> {
  const prefix = `${scope}\0`;
  const keys = [...requested].filter((cacheKey) => cacheKey.startsWith(prefix));
  generations.set(scope, (generations.get(scope) ?? 0) + 1);
  for (const cacheKey of keys) {
    catalogs.delete(cacheKey);
    inFlight.delete(cacheKey);
    requested.delete(cacheKey);
  }
  const entries = [...statuses.windows, ...statuses.wsl];
  await Promise.allSettled(
    keys.map(async (cacheKey) => {
      const kind = cacheKey.slice(prefix.length);
      const entry = entries.find((candidate) => candidate.kind === kind && candidate.installed);
      if (!entry) return;
      await fetchSlashCommandCatalog(scope, kind, () =>
        entry.capabilities.slashCommands !== undefined
          ? Promise.resolve(entry.capabilities.slashCommands)
          : fetch(kind),
      );
    }),
  );
  return applyCachedSlashCommandCatalogs(scope, statuses);
}
