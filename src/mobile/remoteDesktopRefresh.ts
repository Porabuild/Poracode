import type { RemoteShellSnapshot, RemoteThreadSnapshot } from "@/shared/remote";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { applyDesktopSettings } from "./settingsSync";
import { sortThreadsByRecency } from "./presentation";
import { RemoteRefreshScheduler, type RemoteRefreshOptions } from "./remoteRefreshScheduler";
import { RemoteSnapshotCoordinator } from "./remoteSnapshotCoordinator";
import { applyAgentStatuses, applyProviderUsage, applyShellSnapshot } from "./storeSync";
import {
  markDesktopConnected,
  saveShellSnapshot,
  updateDesktopPlatform,
  type StoredDesktop,
} from "./storage";

interface LoadedThreadSnapshot {
  readonly snapshot: RemoteThreadSnapshot;
  readonly fromServer: boolean;
}

export interface RemoteDesktopRefreshRuntime {
  readonly activeDesktopId: () => string | null;
  readonly selectedThreadId: () => string | null;
  readonly rememberShellSnapshot: (snapshot: RemoteShellSnapshot) => void;
  readonly selectThreadIfUnset: (threadId: string | null) => void;
  readonly loadThreadSnapshot: (
    threadId: string,
    desktop: StoredDesktop,
    client: RemoteDesktopClient,
    isCurrent: () => boolean,
  ) => Promise<LoadedThreadSnapshot | null>;
  readonly reloadDesktops: () => Promise<void>;
  readonly advanceSocketSeq: (desktopId: string, seq: number) => void;
  readonly markReachable: () => void;
  readonly reportCacheError: (error: unknown) => void;
  readonly reportRequestError: (error: unknown) => void;
}

/** Runs the authoritative shell snapshot, auxiliary hydration, and durable cursor pipeline. */
export class RemoteDesktopRefreshService {
  private readonly scheduler = new RemoteRefreshScheduler<RemoteShellSnapshot | null>();
  private readonly snapshotCoordinator = new RemoteSnapshotCoordinator();

  currentLiveSeq(desktopId: string): number {
    return this.snapshotCoordinator.currentLiveSeq(desktopId);
  }

  advanceLiveSeq(desktopId: string, seq: number): void {
    this.snapshotCoordinator.advanceLiveSeq(desktopId, seq, false);
  }

  resetPersistence(): void {
    this.snapshotCoordinator.resetPersistence();
  }

  request(
    desktop: StoredDesktop,
    options: RemoteRefreshOptions,
    runtime: RemoteDesktopRefreshRuntime,
  ): Promise<RemoteShellSnapshot | null> {
    const identity = `${desktop.desktopId}\0${desktop.endpoint}\0${desktop.accessToken}`;
    return this.scheduler.request(identity, options, (merged) =>
      this.run(desktop, merged, runtime),
    );
  }

  private async run(
    desktop: StoredDesktop,
    options: RemoteRefreshOptions,
    runtime: RemoteDesktopRefreshRuntime,
  ): Promise<RemoteShellSnapshot | null> {
    const requestSeq = this.snapshotCoordinator.nextRequest(desktop.desktopId);
    const isCurrent = () =>
      this.snapshotCoordinator.isLatest(desktop.desktopId, requestSeq, runtime.activeDesktopId());
    try {
      // Request-sequence checks own lifecycle state here, so this client stays
      // silent: a stale response cannot change foreground reachability.
      const client = new RemoteDesktopClient(desktop.endpoint, desktop.accessToken);
      const snapshot = await client.snapshot();
      if (!isCurrent()) return null;
      applyShellSnapshot(snapshot);
      runtime.rememberShellSnapshot(snapshot);

      if (options.includeAuxiliary ?? true) {
        const [statuses, desktopSettings, environment, providerUsage] = await Promise.allSettled([
          client.agentStatuses(),
          client.settings(),
          desktop.platform ? Promise.resolve(null) : client.environment(),
          client.providerUsage(),
        ]);
        if (!isCurrent()) return null;
        if (statuses.status === "fulfilled") applyAgentStatuses(statuses.value);
        if (desktopSettings.status === "fulfilled") applyDesktopSettings(desktopSettings.value);
        if (providerUsage.status === "fulfilled") applyProviderUsage(providerUsage.value);
        if (environment.status === "fulfilled" && environment.value?.platform) {
          const platform = environment.value.platform;
          if (desktop.platform !== platform) {
            await updateDesktopPlatform(desktop.desktopId, platform).catch(() => undefined);
            await runtime.reloadDesktops();
          }
        }
      }

      if (!isCurrent()) return null;
      const firstThreadId = sortThreadsByRecency(snapshot.threads)[0]?.id ?? null;
      runtime.selectThreadIfUnset(firstThreadId);
      runtime.markReachable();
      const selectedThreadId = runtime.selectedThreadId() ?? firstThreadId ?? undefined;
      let replayCoveredThroughSeq: number | null = snapshot.snapshotSeq;
      if (options.refreshSelectedThread && selectedThreadId) {
        const loaded = await runtime.loadThreadSnapshot(
          selectedThreadId,
          desktop,
          client,
          isCurrent,
        );
        if (!isCurrent()) return null;
        replayCoveredThroughSeq = loaded?.fromServer
          ? Math.min(snapshot.snapshotSeq, loaded.snapshot.snapshotSeq)
          : options.resetLastSeenSeq
            ? snapshot.snapshotSeq
            : null;
      }

      if (replayCoveredThroughSeq !== null) {
        this.snapshotCoordinator.advanceLiveSeq(
          desktop.desktopId,
          replayCoveredThroughSeq,
          options.resetLastSeenSeq === true,
        );
        runtime.advanceSocketSeq(desktop.desktopId, replayCoveredThroughSeq);
      }
      if (!isCurrent()) return null;

      try {
        const persisted = await this.snapshotCoordinator.persistSnapshot({
          desktopId: desktop.desktopId,
          shellSeq: snapshot.snapshotSeq,
          replaySeq: replayCoveredThroughSeq,
          isCurrent,
          saveShell: () => saveShellSnapshot(desktop.desktopId, snapshot),
          markConnected: () => {
            if (replayCoveredThroughSeq === null) {
              return markDesktopConnected(desktop.desktopId);
            }
            return options.resetLastSeenSeq
              ? markDesktopConnected(desktop.desktopId, replayCoveredThroughSeq, {
                  resetLastSeenSeq: true,
                })
              : markDesktopConnected(desktop.desktopId, replayCoveredThroughSeq);
          },
        });
        if (!isCurrent()) return null;
        if (persisted) await runtime.reloadDesktops();
      } catch (error) {
        if (isCurrent()) runtime.reportCacheError(error);
      }
      return snapshot;
    } catch (error) {
      if (!isCurrent()) return null;
      runtime.reportRequestError(error);
      return null;
    }
  }
}
