import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { dbGetProject, dbGetProjects, dbGetThread, dbGetThreads, dbUpdateProject } from "@/host/db";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import type { RemoteAccessTailscaleStatus, StartTailscaleResult } from "@/shared/ipc";
import { buildRemoteGitTargetInterests } from "@/shared/gitStateInterestPolicy";
import type { SharedSettings } from "@/shared/settings";
import { createRemoteMcpSettingsGateway } from "@/host/remote/RemoteMcpSettingsGateway";
import { ThreadNotificationPublisher } from "@/host/remote/ThreadNotificationPublisher";
import { getRemoteAccessPairingInfo } from "@/host/remote/pairingInfo";
import {
  disposeAttemptServer,
  RemoteAccessRetirements,
  type RemoteAccessStartAttempt,
} from "@/host/remote/remoteAccessLifecycle";
import {
  buildTailscaleHttpsUrl,
  disableTailscaleServe,
  enableTailscaleServe,
  launchTailscaleApp,
  probeTailscaleStatus,
  type TailscaleStatus,
} from "@/host/remote/tailscale";
import { PushRegistrationStore } from "@/host/remote/push";
import type { RemoteAccessServerInfo } from "@/host/remote/RemoteAccessServer";
import {
  RemoteAccessStartSupersededError,
  type DesktopRemoteAccessController,
  type DesktopRemoteAccessControllerOptions,
} from "./desktopRemoteAccessControllerTypes";
import {
  startRemoteAccessServer as startDesktopRemoteAccessServer,
  type DesktopRemoteAccessStartContext,
  type DesktopRemoteAccessStartRefs,
} from "./desktopRemoteAccessStart";

export type {
  DesktopRemoteAccessController,
  DesktopRemoteAccessControllerOptions,
} from "./desktopRemoteAccessControllerTypes";
export { redactPairingUrlForLog } from "./desktopRemoteAccessControllerTypes";

/**
 * Owns remote services for a desktop-managed backend and their restartable state.
 * Construction performs no I/O; callers own boot restoration and final disposal.
 */
export function createDesktopRemoteAccessController(
  options: DesktopRemoteAccessControllerOptions,
): DesktopRemoteAccessController {
  const refs: DesktopRemoteAccessStartRefs = {
    remoteAccessServer: null,
    remoteAccessStartAttempt: null,
    remoteAccessGeneration: 0,
    runningLoopbackOnly: false,
    disposed: false,
    pushCoordinator: null,
    mdnsAdvertiser: null,
    portForwarding: null,
    remoteTailscaleServeActiveUrl: null,
    remoteGitSummaries: {},
  };
  let remoteTailscaleLastError: string | null = null;
  let disposePromise: Promise<void> | null = null;
  let gitStatePrewarmed = false;
  const retirements = new RemoteAccessRetirements();
  // Retiring HTTP callbacks and replacement listeners share one lazy cache.
  const pushStore = new PushRegistrationStore(options.paths.baseDir);
  const clearEventInterests = (): void => {
    void options.notifyEventInterestsChanged({
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
  };
  const threadNotifications = new ThreadNotificationPublisher({
    getThread: dbGetThread,
    getProjectName: (projectId) => dbGetProject(projectId)?.name ?? "Project",
    getSettings: () => {
      const settings = readSharedSettingsFile(options.paths.settingsPath);
      return {
        notificationsEnabled: settings.notificationsEnabled,
        notificationStatuses: settings.notificationStatuses,
        notifyL2Cli: settings.notifyL2Cli,
      };
    },
    publish: (notification) => {
      refs.remoteAccessServer?.publishSupervisorEvent({
        type: "remote-user-notification",
        ...notification,
      });
      options.notifyUserNotification?.(notification);
    },
  });

  const prewarmGitStateOnce = (): void => {
    if (gitStatePrewarmed) return;
    gitStatePrewarmed = true;
    const interests = buildRemoteGitTargetInterests(dbGetThreads(), {
      includeRecentFallback: true,
    });
    if (interests.length === 0) return;
    void options.gitStateService.refreshInterests(interests, { fetchRemote: true });
  };

  /** Compat partial patch through the composition's settings authority. The
   * committed broadcast happens in the authority's `onCommitted` hook. */
  const commitSettingsPatch = (patch: {
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }): Promise<SharedSettings> => options.settingsWrites.commitCompatPatch(patch);

  /**
   * CAS-guarded revert of this controller's own committed write: the field is
   * moved back only while the authority still holds the value we wrote, so a
   * concurrent flip of the same field wins instead of being clobbered by the
   * stale previous value. A revert that cannot commit is reported, but never
   * masks the original failure.
   */
  const revertCommittedSetting = async <
    F extends "remoteAccessTailscaleHttps" | "remoteAccessAdvertisedUrl",
  >(
    field: F,
    written: SharedSettings[F],
    previous: SharedSettings[F],
  ): Promise<void> => {
    const result = await options.settingsWrites.editSettingsField(field, (current) =>
      current[field] === written ? previous : current[field],
    );
    if (result.status !== "committed") {
      options.reportError(new Error(`The ${field} revert did not commit (${result.status}).`), {
        "poracode.feature_area": "remote-access",
      });
    }
  };

  const writeRemoteAccessEnabledSetting = (enabled: boolean): Promise<SharedSettings> =>
    commitSettingsPatch({ remoteAccessEnabled: enabled });

  const mcpSettings = createRemoteMcpSettingsGateway({
    readSettings: () => readSharedSettingsFile(options.paths.settingsPath),
    // Scoped CAS edit of the whole `mcpServers` field, derived from the
    // freshest committed state; a surviving conflict is reported, never
    // written over the concurrent writer (mirrors the headless composition).
    writeGlobalServers: (mcpServers) => {
      void options.settingsWrites
        .editSettingsField("mcpServers", () => mcpServers)
        .then((result) => {
          if (result.status !== "committed") {
            options.reportError(
              new Error(`MCP server settings were not committed (${result.status}).`),
              { "poracode.feature_area": "remote-access" },
            );
          }
        })
        .catch((error: unknown) =>
          options.reportError(error, { "poracode.feature_area": "remote-access" }),
        );
    },
    readProject: dbGetProject,
    writeProject: dbUpdateProject,
    projectsChanged: () => options.notifyProjectStateChanged(dbGetProjects()),
  });

  /** Defensive read-time normalization; the setter rejects invalid input. */
  const normalizeAdvertisedUrlSetting = (raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
      return `${url.origin}/`;
    } catch {
      return undefined;
    }
  };

  /** Best-effort Tailscale setup; failure falls through to the next URL tier. */
  const setUpTailscaleServe = async (port: number): Promise<string | undefined> => {
    const status = await probeTailscaleStatus();
    if (status.state !== "running") {
      remoteTailscaleLastError = status.state === "error" ? status.message : null;
      return undefined;
    }
    if (!status.dnsName) {
      remoteTailscaleLastError = "Tailscale MagicDNS name is unavailable.";
      return undefined;
    }
    const result = await enableTailscaleServe(port);
    if (!result.ok) {
      remoteTailscaleLastError = result.message;
      return undefined;
    }
    remoteTailscaleLastError = null;
    return buildTailscaleHttpsUrl(status.dnsName);
  };

  /** env override -> Tailscale HTTPS -> custom URL -> LAN host/port. */
  const resolveAdvertisedBaseUrl = async (
    port: number,
  ): Promise<{ advertisedBaseUrl?: string; tailscaleServeUrl?: string }> => {
    const envAdvertisedHost = process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST?.trim();
    if (envAdvertisedHost) return {};

    const settings = readSharedSettingsFile(options.paths.settingsPath);
    if (settings.remoteAccessTailscaleHttps) {
      const tailscaleUrl = await setUpTailscaleServe(port);
      if (tailscaleUrl) {
        return { advertisedBaseUrl: tailscaleUrl, tailscaleServeUrl: tailscaleUrl };
      }
    } else {
      remoteTailscaleLastError = null;
    }
    const advertisedBaseUrl = normalizeAdvertisedUrlSetting(settings.remoteAccessAdvertisedUrl);
    return advertisedBaseUrl ? { advertisedBaseUrl } : {};
  };

  const isCurrentStartAttempt = (attempt: RemoteAccessStartAttempt): boolean =>
    !refs.disposed &&
    !attempt.cancelled &&
    attempt.generation === refs.remoteAccessGeneration &&
    refs.remoteAccessStartAttempt === attempt;

  /**
   * The user-facing enablement state of the RUNNING (or starting) server. The
   * always-on loopback-only instance is deliberately invisible here: the
   * pairing QR, session list, and refresh flow stay `disabled` until the user
   * actually enables remote access, so a reachable loopback listener never
   * becomes a discoverable advertisement (V5 plan 2.5 completion).
   */
  const isRemoteAccessUserEnabled = (): boolean => {
    const attempt = refs.remoteAccessStartAttempt;
    const server = refs.remoteAccessServer ?? attempt?.server ?? null;
    if (!server) return false;
    if (attempt && !attempt.cancelled) return !attempt.loopbackOnly;
    return !refs.runningLoopbackOnly;
  };

  const getPairingInfo = () =>
    getRemoteAccessPairingInfo(isRemoteAccessUserEnabled() ? refs.remoteAccessServer : null);

  const teardownAttemptTailscaleServe = (attempt: RemoteAccessStartAttempt): Promise<void> => {
    if (!attempt.tailscaleServeUrl) return Promise.resolve();
    if (attempt.tailscaleTeardownPromise) return attempt.tailscaleTeardownPromise;
    if (refs.remoteTailscaleServeActiveUrl === attempt.tailscaleServeUrl) {
      refs.remoteTailscaleServeActiveUrl = null;
    }
    attempt.tailscaleTeardownPromise = disableTailscaleServe().catch(() => {});
    return attempt.tailscaleTeardownPromise;
  };

  const stopMdnsAdvertiser = (): Promise<void> => {
    const advertiser = refs.mdnsAdvertiser;
    refs.mdnsAdvertiser = null;
    return advertiser ? advertiser.stop() : Promise.resolve();
  };

  const startContext: DesktopRemoteAccessStartContext = {
    options,
    refs,
    retirements,
    pushStore,
    mcpSettings,
    commitSettingsPatch,
    isCurrentStartAttempt,
    stopMdnsAdvertiser,
    resolveAdvertisedBaseUrl,
    teardownAttemptTailscaleServe,
    getPairingInfo,
    prewarmGitStateOnce,
    clearEventInterests,
  };

  const startRemoteAccessServer = (loopbackOnly: boolean): Promise<RemoteAccessServerInfo> =>
    startDesktopRemoteAccessServer(startContext, loopbackOnly);

  /** Best-effort teardown of a Tailscale mapping established by this process. */
  const teardownTailscaleServe = (): Promise<void> => {
    if (!refs.remoteTailscaleServeActiveUrl) return Promise.resolve();
    refs.remoteTailscaleServeActiveUrl = null;
    return disableTailscaleServe().catch(() => {});
  };

  // V5 plan 2.5 completion: the unconditional full "stop" path is gone —
  // disabling DOWNGRADES to the always-on loopback instance
  // ({@link restartRemoteAccessServer}(true)) instead of tearing the server
  // out, so the managed desktop never loses its loopback leg.

  const restartRemoteAccessServer = async (loopbackOnly: boolean): Promise<void> => {
    const restartGeneration = refs.remoteAccessGeneration;
    const starting = refs.remoteAccessStartAttempt;
    if (!refs.remoteAccessServer && !starting) return;
    if (starting) {
      await starting.promise.catch(() => {});
      if (starting.cancelled) return;
    }
    if (refs.disposed || restartGeneration !== refs.remoteAccessGeneration) return;
    const server = refs.remoteAccessServer;
    const coordinator = refs.pushCoordinator;
    refs.remoteAccessServer = null;
    refs.pushCoordinator = null;
    refs.runningLoopbackOnly = false;
    await retirements.run([
      () => server?.dispose(),
      () => coordinator?.dispose(),
      () => stopMdnsAdvertiser(),
      teardownTailscaleServe,
    ]);
    if (refs.disposed || restartGeneration !== refs.remoteAccessGeneration) return;
    try {
      await startRemoteAccessServer(loopbackOnly);
    } catch (error) {
      if (
        error instanceof RemoteAccessStartSupersededError &&
        (refs.disposed || restartGeneration !== refs.remoteAccessGeneration)
      ) {
        return;
      }
      throw error;
    }
  };

  const buildTailscaleStatusResponse = (
    enabled: boolean,
    status: TailscaleStatus,
  ): RemoteAccessTailscaleStatus => {
    const serveActive = refs.remoteTailscaleServeActiveUrl !== null;
    if (status.state === "not-installed") {
      return { enabled, serveActive, daemon: "not-installed" };
    }
    if (status.state === "not-running") {
      return { enabled, serveActive, daemon: "not-running" };
    }
    if (status.state === "needs-login") {
      return { enabled, serveActive, daemon: "needs-login" };
    }
    if (status.state === "error") {
      return { enabled, serveActive, daemon: "error", message: status.message };
    }
    const httpsUrl =
      refs.remoteTailscaleServeActiveUrl ??
      (status.dnsName ? buildTailscaleHttpsUrl(status.dnsName) : undefined);
    return {
      enabled,
      serveActive,
      daemon: "running",
      httpsAvailable: status.httpsAvailable,
      ...(status.dnsName ? { dnsName: status.dnsName } : {}),
      ...(httpsUrl ? { httpsUrl } : {}),
      ...(remoteTailscaleLastError ? { message: remoteTailscaleLastError } : {}),
    };
  };

  const getTailscaleStatus = async (): Promise<RemoteAccessTailscaleStatus> => {
    const enabled = readSharedSettingsFile(options.paths.settingsPath).remoteAccessTailscaleHttps;
    const status = await probeTailscaleStatus();
    return buildTailscaleStatusResponse(enabled, status);
  };

  const setTailscaleHttps = async (enabled: boolean) => {
    const previous = readSharedSettingsFile(options.paths.settingsPath).remoteAccessTailscaleHttps;
    await commitSettingsPatch({ remoteAccessTailscaleHttps: enabled });
    try {
      await restartRemoteAccessServer(false);
    } catch (error) {
      await revertCommittedSetting("remoteAccessTailscaleHttps", enabled, previous);
      throw error;
    }
    return getRemoteAccessPairingInfo(refs.remoteAccessServer);
  };

  const startTailscale = async (): Promise<StartTailscaleResult> => {
    const result = await launchTailscaleApp();
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  };

  const setAdvertisedUrl = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    let normalized = "";
    if (trimmed) {
      let url: URL;
      try {
        url = new URL(trimmed);
      } catch {
        throw new Error("Enter a valid URL, for example https://code.example.com.");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Public URL must start with http:// or https://.");
      }
      if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
        throw new Error("Public URL must be an origin only, with no path or query.");
      }
      normalized = url.origin;
    }
    const previous = readSharedSettingsFile(options.paths.settingsPath).remoteAccessAdvertisedUrl;
    await commitSettingsPatch({ remoteAccessAdvertisedUrl: normalized });
    try {
      await restartRemoteAccessServer(false);
    } catch (error) {
      await revertCommittedSetting("remoteAccessAdvertisedUrl", normalized, previous);
      throw error;
    }
    return getRemoteAccessPairingInfo(refs.remoteAccessServer);
  };

  const setEnabled = async (enabled: boolean) => {
    if (!enabled) {
      // Persist the disable before downgrading: a settings conflict rejects the
      // call with the server (and the enabled flag) untouched.
      await writeRemoteAccessEnabledSetting(false);
      // V5 plan 2.5 completion: disabling keeps the managed flavor's ALWAYS-ON
      // loopback instance alive — the renderer's unified leg and the loopback
      // bootstrap keep working — but the discoverable (advertised) surface is
      // torn down and pairing info reports `disabled` again. Like the old
      // stop, the downgrade never blocks on in-flight work (a held push, a
      // draining request): it runs in the background and the UI reflects
      // `disabled` immediately.
      void restartRemoteAccessServer(true).catch(() => {
        // The persisted disable already succeeded. Restore the always-on
        // loopback leg in the background; the desktop-IPC relay covers
        // meanwhile.
        void startRemoteAccessServer(true).catch(() => undefined);
      });
      return getPairingInfo();
    }

    await writeRemoteAccessEnabledSetting(true);
    try {
      await startRemoteAccessServer(false);
    } catch (error) {
      if (error instanceof RemoteAccessStartSupersededError) {
        return getPairingInfo();
      }
      throw error;
    }
    return getPairingInfo();
  };

  /**
   * Readiness (V5 plan 2.5 completion): the managed desktop ALWAYS ends up
   * with a loopback-bound remote server. When remote access is enabled the
   * full instance covers it; otherwise a loopback-only instance starts so the
   * co-located renderer can always attach (reachable, not discoverable).
   * Startup failure is contained (reported, retried on the next readiness
   * call) — the desktop-IPC relay stays the fallback leg.
   */
  const startIfEnabled = async (): Promise<void> => {
    const enabled = readSharedSettingsFile(options.paths.settingsPath).remoteAccessEnabled === true;
    try {
      await startRemoteAccessServer(!enabled);
    } catch (error) {
      if (error instanceof RemoteAccessStartSupersededError) return;
    }
  };

  const getManagedLoopbackBootstrap = async () => {
    if (refs.disposed) return null;
    // Serialize behind readiness: the renderer may ask while the always-on
    // start is still in flight. The credential mint below happens only once
    // the server is actually serving.
    try {
      await startRemoteAccessServer(
        readSharedSettingsFile(options.paths.settingsPath).remoteAccessEnabled !== true,
      );
    } catch {
      return null;
    }
    if (refs.disposed) return null;
    const server = refs.remoteAccessServer;
    if (!server) return null;
    const credential = server.mintLoopbackRendererCredential();
    if (!credential) return null;
    return {
      endpoint: credential.endpoint,
      pairingUrl: credential.pairingUrl,
    };
  };

  return {
    getServer: () => refs.remoteAccessServer,
    getPairingInfo,
    isUserEnabled: isRemoteAccessUserEnabled,
    getManagedLoopbackBootstrap,
    handleSupervisorEvent: (event) => {
      refs.remoteAccessServer?.publishSupervisorEvent(event);
      refs.pushCoordinator?.handleSupervisorEvent(event);
      threadNotifications.handleSupervisorEvent(event);
    },
    handleSupervisorReset: () => {
      // No `thread-exited` is emitted for the sessions that died with the old
      // supervisor process, so their cached background-task levels would
      // otherwise shadow the fresh live reads forever.
      refs.remoteAccessServer?.clearBackgroundTaskLevels();
      // Follow-up queues are supervisor-owned memory. Clear the remote
      // renderer's rows when that process disappears; otherwise a phone can
      // keep stale items whose next action only fails with item-not-found.
      for (const thread of dbGetThreads()) {
        refs.remoteAccessServer?.publishSupervisorEvent({
          type: "thread-follow-up-queue",
          threadId: thread.id,
          queue: null,
        });
      }
    },
    updateGitSummaries: (summaries) => {
      refs.remoteGitSummaries = summaries;
      refs.remoteAccessServer?.publishSupervisorEvent({
        type: "remote-git-summaries",
        summaries,
      });
    },
    startIfEnabled,
    setEnabled,
    getTailscaleStatus,
    setTailscaleHttps,
    startTailscale,
    setAdvertisedUrl,
    dispose: () => {
      if (disposePromise) return disposePromise;
      const barrier = Promise.withResolvers<void>();
      disposePromise = barrier.promise;
      refs.disposed = true;
      refs.remoteAccessGeneration += 1;
      const attempt = refs.remoteAccessStartAttempt;
      if (attempt) attempt.cancelled = true;
      const server = refs.remoteAccessServer ?? attempt?.server ?? null;
      const coordinator = refs.pushCoordinator ?? attempt?.coordinator ?? null;
      const forwarding = refs.portForwarding;
      refs.remoteAccessServer = null;
      refs.pushCoordinator = null;
      refs.portForwarding = null;
      // Preserve the historical before-quit ordering: start closing the HTTP
      // server, then immediately tear down forwarding, without disabling Serve.
      const currentDisposal = retirements.run([
        () =>
          server
            ? attempt?.server === server
              ? disposeAttemptServer(attempt)
              : server.dispose()
            : undefined,
        () => coordinator?.dispose(),
        () => stopMdnsAdvertiser(),
        clearEventInterests,
        () => forwarding?.dispose(),
      ]);
      const startSettlement = attempt
        ? attempt.promise.catch((error: unknown) => {
            if (!(error instanceof RemoteAccessStartSupersededError)) throw error;
          })
        : Promise.resolve();
      void joinRuntimeShutdown([
        () => currentDisposal,
        () => startSettlement.then(() => undefined),
        () => retirements.drain(),
      ]).then(barrier.resolve, barrier.reject);
      return disposePromise;
    },
  };
}
