import type { McpServer } from "@/shared/contracts";
import {
  flushSharedSettings,
  useSharedSettings,
  whenSharedSettingsHydrated,
} from "@/renderer/state/sharedSettingsStore";

/**
 * The persist surface the MCP mutation helpers need; `McpServerSource` and
 * `McpImportProjectTarget` both extend it.
 *
 * - `loadServers` is the authoritative re-read for sources whose catalog row
 *   does not carry private MCP settings: an absolute-list commit (import, add,
 *   move) against such a source must merge into the freshly loaded list, never
 *   into a not-yet-loaded projection that would erase the host's real
 *   configuration. Without it the captured `servers` list stands in.
 * - `saveServers` is the only persist channel. It resolves when the write is
 *   as confirmed as that source can be and rejects on refusal — commit paths
 *   that sequence another write after it (a move must not delete the source
 *   copy before the destination save is confirmed) rely on both.
 */
export interface McpServersSink {
  servers: McpServer[];
  loadServers?: () => Promise<McpServer[]>;
  saveServers: (servers: McpServer[]) => Promise<void>;
}

/** The source's current list — authoritative when it exposes a fresh read. */
export async function readCurrentServers(sink: McpServersSink): Promise<McpServer[]> {
  return sink.loadServers ? sink.loadServers() : sink.servers;
}

/**
 * Apply one row-level edit (enable/disable, tool toggles) to the source's
 * CURRENT list, never the render-time projection: another client's servers and
 * the row's latest fields are preserved. A row that has vanished from the
 * fresh read is not resurrected and nothing is written.
 */
export async function updateServerRow(
  sink: McpServersSink,
  serverId: string,
  update: (server: McpServer) => McpServer,
): Promise<void> {
  const current = await readCurrentServers(sink);
  let found = false;
  const next = current.map((item) => {
    if (item.id !== serverId) return item;
    found = true;
    return update(item);
  });
  if (!found) return;
  await sink.saveServers(next);
}

/**
 * Remove one row from the source's CURRENT list, preserving everything else.
 * A row that is already gone on the fresh read stays gone — nothing is
 * written back.
 */
export async function removeServerRow(sink: McpServersSink, serverId: string): Promise<void> {
  const current = await readCurrentServers(sink);
  if (!current.some((item) => item.id === serverId)) return;
  await sink.saveServers(current.filter((item) => item.id !== serverId));
}

/**
 * Fresh read + confirmed save for the shared-settings Global source, wired by
 * the settings surfaces. Both operations wait for the owner settings to
 * hydrate first: an unhydrated read is empty-by-default (committing against it
 * would clobber the real configuration), and `flushSharedSettings` skips the
 * bridge write until hydration, so a commit before hydration could not be
 * confirmed. Reads always hit the live store — never a captured projection.
 */
export function sharedSettingsServerPersistence(): {
  loadServers: () => Promise<McpServer[]>;
  saveServers: (servers: McpServer[]) => Promise<void>;
} {
  return {
    loadServers: async () => {
      await whenSharedSettingsHydrated();
      return useSharedSettings.getState().mcpServers;
    },
    saveServers: async (servers) => {
      await whenSharedSettingsHydrated();
      useSharedSettings.getState().setMcpServers(servers);
      await flushSharedSettings();
    },
  };
}
