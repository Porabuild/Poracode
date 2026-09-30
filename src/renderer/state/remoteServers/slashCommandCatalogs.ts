import type { AgentSlashCommand } from "@/shared/contracts";
import type { RemoteAgentStatuses } from "@/shared/remote/protocol";

/**
 * WS3-A lazy slash-command catalogs. The agent-statuses HTTP payload omits
 * the per-agent command catalogs (the dominant payload bulk — full skill
 * descriptions for every detected agent); this module caches the lazily
 * fetched catalog per (desktopId, kind) so refreshed agent-statuses payloads
 * — which never carry commands — are re-completed before they reach the
 * composer's slash menu.
 */

const catalogs = new Map<string, AgentSlashCommand[]>();
const inFlight = new Map<string, Promise<AgentSlashCommand[]>>();

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
          if (!commands) return entry;
          return {
            ...entry,
            capabilities: { ...entry.capabilities, slashCommands: [...commands] },
          };
        })
      : entries;
  return { ...statuses, windows: patch(statuses.windows), wsl: patch(statuses.wsl) };
}

/** Fetches one agent's catalog once per session (concurrent callers share the
 * in-flight promise) and hands it back for the caller to splice into state.
 * Failures surface to the caller; nothing is cached so a retry can succeed. */
export function fetchSlashCommandCatalog(
  desktopId: string,
  kind: string,
  fetch: () => Promise<AgentSlashCommand[]>,
): Promise<AgentSlashCommand[]> {
  const cacheKey = key(desktopId, kind);
  const known = catalogs.get(cacheKey);
  if (known) return Promise.resolve(known);
  const cachedFetch = inFlight.get(cacheKey);
  if (cachedFetch) return cachedFetch;
  const pending = fetch()
    .then((commands) => {
      catalogs.set(cacheKey, commands);
      return commands;
    })
    .finally(() => {
      if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, pending);
  return pending;
}
