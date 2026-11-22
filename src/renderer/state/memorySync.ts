import { create } from "zustand";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import { useGitStore } from "@/renderer/state/gitStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { MemorySyncResponse, MemorySyncState } from "@/shared/memory";
import type { AppMemorySyncResult } from "@/shared/contracts/appMemorySync";
import { friendlyError } from "@/shared/messages";
import { repoIdentityKey } from "@/shared/repoIdentity";

export interface MemorySyncProgress {
  phase: "exporting" | "syncing" | "propagating";
  current: number;
  total: number;
  hostLabel?: string;
}

export interface MemorySyncDetails extends AppMemorySyncResult {
  onlineHosts: number;
  skippedDisabledHosts: string[];
  failedHosts: Array<{ label: string; message: string }>;
}

export interface MemoryActionNotice {
  kind: "info" | "success" | "warning" | "error";
  text: string;
}

interface MemoryOperationsState {
  syncing: boolean;
  syncProgress: MemorySyncProgress | null;
  dreaming: boolean;
  dreamStartedAt: number | null;
  undoing: boolean;
  notice: MemoryActionNotice | null;
  setSyncProgress: (progress: MemorySyncProgress | null) => void;
  setSyncing: (syncing: boolean) => void;
  setDreaming: (dreaming: boolean, startedAt?: number | null) => void;
  setUndoing: (undoing: boolean) => void;
  setNotice: (notice: MemoryActionNotice | null) => void;
}

export const useMemoryOperationsStore = create<MemoryOperationsState>((set) => ({
  syncing: false,
  syncProgress: null,
  dreaming: false,
  dreamStartedAt: null,
  undoing: false,
  notice: null,
  setSyncProgress: (syncProgress) => set({ syncProgress }),
  setSyncing: (syncing) => set(syncing ? { syncing } : { syncing, syncProgress: null }),
  setDreaming: (dreaming, startedAt) =>
    set({
      dreaming,
      dreamStartedAt: dreaming ? (startedAt ?? Date.now()) : null,
    }),
  setUndoing: (undoing) => set({ undoing }),
  setNotice: (notice) => set({ notice }),
}));

type MemorySyncOutcome = MemorySyncDetails & { failure?: { error: unknown } };
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
export async function syncMemoryAcrossEnvironmentsDetailed(options?: {
  force?: boolean;
}): Promise<MemorySyncDetails> {
  const outcome = await (inFlight ??= runSync().finally(() => {
    inFlight = null;
  }));
  if (options?.force && outcome.failure && outcome.syncedHosts === 0) {
    throw outcome.failure.error instanceof Error
      ? outcome.failure.error
      : new Error("Failed to sync with paired hosts.");
  }
  return {
    syncedHosts: outcome.syncedHosts,
    changed: outcome.changed,
    onlineHosts: outcome.onlineHosts,
    skippedDisabledHosts: outcome.skippedDisabledHosts,
    failedHosts: outcome.failedHosts,
  };
}

export async function syncMemoryAcrossEnvironments(options?: {
  force?: boolean;
}): Promise<AppMemorySyncResult> {
  const { syncedHosts, changed } = await syncMemoryAcrossEnvironmentsDetailed(options);
  return { syncedHosts, changed };
}

async function runSync(): Promise<MemorySyncOutcome> {
  const empty: MemorySyncOutcome = {
    syncedHosts: 0,
    changed: false,
    onlineHosts: 0,
    skippedDisabledHosts: [],
    failedHosts: [],
  };
  if (isRemoteSession()) return empty;
  const memory = useSharedSettings.getState().memory;
  if (!memory.enabled || !memory.syncEnabled) {
    return empty;
  }

  const remoteState = useRemoteServersStore.getState();
  const onlinePeers = remoteState.servers
    .map((server) => ({
      key: remoteConnectionKey(server),
      label: server.label?.trim() || server.desktopId,
    }))
    .filter((peer) => remoteState.runtime[peer.key]?.status === "online");
  if (onlinePeers.length === 0) return empty;

  const ops = useMemoryOperationsStore.getState();
  ops.setSyncing(true);
  ops.setSyncProgress({ phase: "exporting", current: 0, total: onlinePeers.length });

  try {
    const bridge = readBridge();
    const projectRepoKeys = collectProjectRepoKeys();
    let localState = (await bridge.memoryCommand({
      action: "sync-export",
      projectRepoKeys,
    })) as MemorySyncState;

    let syncedHosts = 0;
    let changed = false;
    let failure: MemorySyncOutcome["failure"];
    const syncedPeers: Array<{ key: string; label: string }> = [];
    const skippedDisabledHosts: string[] = [];
    const failedHosts: Array<{ label: string; message: string }> = [];

    for (let index = 0; index < onlinePeers.length; index += 1) {
      const peer = onlinePeers[index]!;
      ops.setSyncProgress({
        phase: "syncing",
        current: index + 1,
        total: onlinePeers.length,
        hostLabel: peer.label,
      });
      try {
        const response = (await remoteState.withClient(peer.key, (client) =>
          client.memorySync(localState),
        )) as MemorySyncResponse;
        if (!response.synced) {
          skippedDisabledHosts.push(peer.label);
          continue;
        }
        syncedHosts += 1;
        syncedPeers.push(peer);
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
        failedHosts.push({ label: peer.label, message: friendlyError(error) });
      }
    }

    if (changed && syncedPeers.length > 1) {
      for (let index = 0; index < syncedPeers.length; index += 1) {
        const peer = syncedPeers[index]!;
        ops.setSyncProgress({
          phase: "propagating",
          current: index + 1,
          total: syncedPeers.length,
          hostLabel: peer.label,
        });
        try {
          await remoteState.withClient(peer.key, (client) => client.memorySync(localState));
        } catch {
          // Peer will pick up the merged state on the next sync pass.
        }
      }
    }

    return {
      syncedHosts,
      changed,
      onlineHosts: onlinePeers.length,
      skippedDisabledHosts,
      failedHosts,
      ...(failure ? { failure } : {}),
    };
  } finally {
    ops.setSyncing(false);
  }
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
