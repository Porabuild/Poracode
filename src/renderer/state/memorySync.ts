import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import { useGitStore } from "@/renderer/state/gitStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { MemorySyncResponse, MemorySyncState } from "@/shared/memory";
import type { AppMemorySyncResult } from "@/shared/contracts/appMemorySync";
import { repoIdentityKey } from "@/shared/repoIdentity";

type MemorySyncOutcome = AppMemorySyncResult & { failure?: { error: unknown } };
let inFlight: Promise<MemorySyncOutcome> | null = null;

export function collectProjectRepoKeys(): Record<string, string> {
  const index = getProjectGroupIndex();
  const gitStatuses = useGitStore.getState().statuses;
  const map: Record<string, string> = {};
  for (const group of index.groups) {
    for (const member of group.members) {
      const repoKey =
        repoIdentityKey(gitStatuses[member.id]?.remoteInfo) ?? group.syncKeys.get(member.id);
      if (repoKey && !repoKey.startsWith("solo:")) {
        map[member.id] = repoKey;
      }
    }
  }
  return map;
}

/**
 * Merge memories across this desktop and every online paired environment:
 * global notes plus project notes whose repository identity matches.
 */
export async function syncMemoryAcrossEnvironments(options?: {
  force?: boolean;
}): Promise<AppMemorySyncResult> {
  const { syncedHosts, changed, failure } = await (inFlight ??= runSync().finally(() => {
    inFlight = null;
  }));
  if (options?.force && failure && syncedHosts === 0) {
    throw failure.error instanceof Error
      ? failure.error
      : new Error("Failed to sync with paired hosts.");
  }
  return { syncedHosts, changed };
}

async function runSync(): Promise<MemorySyncOutcome> {
  if (isRemoteSession()) return { syncedHosts: 0, changed: false };
  const memory = useSharedSettings.getState().memory;
  if (!memory.enabled || !memory.syncEnabled) {
    return { syncedHosts: 0, changed: false };
  }

  const remoteState = useRemoteServersStore.getState();
  const onlineKeys = remoteState.servers
    .map(remoteConnectionKey)
    .filter((key) => remoteState.runtime[key]?.status === "online");
  if (onlineKeys.length === 0) return { syncedHosts: 0, changed: false };

  const bridge = readBridge();
  const projectRepoKeys = collectProjectRepoKeys();
  let localState = (await bridge.memoryCommand({
    action: "sync-export",
    projectRepoKeys,
  })) as MemorySyncState;

  let syncedHosts = 0;
  let changed = false;
  let failure: MemorySyncOutcome["failure"];
  const syncedKeys: string[] = [];

  for (const key of onlineKeys) {
    try {
      const response = (await remoteState.withClient(key, (client) =>
        client.memorySync(localState),
      )) as MemorySyncResponse;
      if (!response.synced) continue;
      syncedHosts += 1;
      syncedKeys.push(key);
      const merged = (await bridge.memoryCommand({
        action: "sync-merge",
        state: response.state,
        projectRepoKeys,
      })) as { synced: boolean; changed?: boolean; state: MemorySyncState };
      if (merged.changed) {
        changed = true;
        localState = merged.state;
      }
    } catch (error) {
      failure = { error };
    }
  }

  if (changed && syncedKeys.length > 1) {
    for (const key of syncedKeys) {
      try {
        await remoteState.withClient(key, (client) => client.memorySync(localState));
      } catch {
        // Peer will pick up the merged state on the next sync pass.
      }
    }
  }

  return { syncedHosts, changed, ...(failure ? { failure } : {}) };
}

export function installMemoryEnvironmentAutoSync(): () => void {
  if (isRemoteSession()) return () => undefined;
  let previousOnline = new Set<string>();
  let wasEnabled = false;
  let timer: number | undefined;

  const schedule = (delayMs = 800) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void syncMemoryAcrossEnvironments().catch((error: unknown) => {
        console.warn("[memory] automatic sync failed", error);
      });
    }, delayMs);
  };

  const unsubscribeServers = useRemoteServersStore.subscribe((state) => {
    const nextOnline = new Set(
      state.servers
        .map(remoteConnectionKey)
        .filter((key) => state.runtime[key]?.status === "online"),
    );
    let newlyOnline = false;
    for (const key of nextOnline) {
      if (!previousOnline.has(key)) {
        newlyOnline = true;
        break;
      }
    }
    previousOnline = nextOnline;
    if (newlyOnline) schedule();
  });

  const unsubscribeSettings = useSharedSettings.subscribe((state) => {
    const active = state.memory.enabled && state.memory.syncEnabled;
    if (active && !wasEnabled) schedule(200);
    wasEnabled = active;
  });

  const interval = window.setInterval(() => schedule(0), 300_000);

  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    window.clearInterval(interval);
    unsubscribeServers();
    unsubscribeSettings();
  };
}
