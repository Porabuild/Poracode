import {
  dbGetProjects,
  dbGetThreads,
  dbMarkLiveThreadsInactive,
  onProjectThreadDataChanged,
} from "@/main/db";
import {
  createDesktopRemoteAccessController,
  type DesktopRemoteAccessController,
} from "@/main/remote/DesktopRemoteAccessController";
import { RemoteHttpError } from "@/host/remote/auth";
import { getRemoteAccessPairingInfo } from "@/host/remote/pairingInfo";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileIdentityResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "@/main/profile";
import { readSharedSettingsFile } from "@/main/sharedSettingsFile";
import { readOrCreateRemoteAccessIdentity } from "@/host/remote/identity";
import { requestLegacyDataMigration } from "@/main/legacyDataMigration";
import { isThreadTurnActive, type RemoteThreadCommand } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { remoteProjectCommandResultSchema, type RemoteHostUpdateStatus } from "@/shared/remote";
import type {
  BackendHostInitializePayload,
  BackendDatabaseCall,
  BackendNativeEvent,
  BackendNativeRequest,
  BackendServiceCall,
  BackendServiceProcedureName,
  BackendServiceResult,
  BackendSettingsProcedureName,
} from "@/shared/backendHostProtocol";
import { RevertCheckpointRefusedError, type BackendHostCore } from "./BackendHostCore";
import { BackendDurableServices } from "./BackendDurableServices";
import { BackendRemoteBrowserProxy } from "./BackendRemoteBrowserProxy";
import { generateBackendImagePreview } from "./BackendImagePreview";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";
import { createBackendSettingsAccess, type BackendSettingsAccess } from "./BackendSettingsService";
import { type BackendSettingsNotifications } from "./BackendSettingsNotifications";

export interface BackendDesktopServicesOptions {
  initialize: BackendHostInitializePayload;
  host: BackendHostCore;
  requestNative(request: BackendNativeRequest): Promise<unknown>;
  emitNativeEvent(event: BackendNativeEvent): void;
  reportError(
    error: unknown,
    tags?: import("@/shared/diagnostics/sentryPrivacy").PoracodeDiagnosticTags,
  ): void;
  setRemoteEventInterests(
    interests: import("@/shared/liveEventInterests").LiveEventInterests,
  ): void;
}

const SHELL_PROJECTION_DATABASE_CALLS: ReadonlySet<BackendDatabaseCall["name"]> = new Set([
  "dbUpsertProject",
  "dbDeleteProject",
  "dbUpsertThread",
  "dbDeleteThread",
  "dbSyncAll",
  "dbSyncChanges",
  "dbPersistExperimentState",
]);

export function affectsShellProjection(name: BackendDatabaseCall["name"]): boolean {
  return SHELL_PROJECTION_DATABASE_CALLS.has(name);
}

/**
 * Canonical desktop/headless-capable backend composition. All durable services
 * live beside the single SQLite connection and the Supervisor proxy; Electron
 * is reached only through the explicitly typed native request/event boundary.
 */
export class BackendDesktopServices {
  private disposal: Promise<void> | null = null;
  private readonly durable: BackendDurableServices;
  private readonly remote: DesktopRemoteAccessController | null;
  private readonly browser: BackendRemoteBrowserProxy;
  private readonly stopProjectionWatch: () => void;
  private readonly settings: BackendSettingsAccess;
  private updateStatus: RemoteHostUpdateStatus | null = null;

  constructor(private readonly options: BackendDesktopServicesOptions) {
    const { initialize, host } = options;
    const desktop = initialize.desktop;
    const supervisor = host.supervisorClient;
    const settingsNotifications: BackendSettingsNotifications = {
      onChanged: (settings) =>
        options.emitNativeEvent({ type: "shared-settings-changed", settings }),
      reportError: options.reportError,
    };
    this.settings = createBackendSettingsAccess({
      settingsPath: () => {
        if (!desktop) throw new Error("Desktop services are not configured.");
        return desktop.settingsPath;
      },
      ...settingsNotifications,
    });
    this.browser = new BackendRemoteBrowserProxy(options.requestNative, options.reportError);
    this.stopProjectionWatch = onProjectThreadDataChanged(() => {
      options.emitNativeEvent({ type: "database-projection-changed" });
    });
    const getSharedSettings = () => {
      if (!desktop) throw new Error("Desktop services are not configured.");
      return readSharedSettingsFile(desktop.settingsPath);
    };
    const dispatchThreadCommand = async (command: RemoteThreadCommand): Promise<boolean> =>
      (await options.requestNative({ operation: "dispatch-thread-command", payload: command })) ===
      true;
    const sendThreadCommand = (command: RemoteThreadCommand): boolean => {
      void dispatchThreadCommand(command).catch(options.reportError);
      return true;
    };
    const publishProjectsChanged = (): void => {
      const projects = dbGetProjects();
      this.remote?.getServer()?.publishSupervisorEvent({
        type: "remote-projects-changed",
        projects: remoteProjectCommandResultSchema.parse({ projects }).projects,
      });
      options.emitNativeEvent({ type: "projects-changed", projects });
    };

    this.durable = new BackendDurableServices({
      appVersion: initialize.supervisor.appVersion,
      hostId: readOrCreateRemoteAccessIdentity(initialize.baseDir).desktopId,
      supervisor,
      sendThreadCommand,
      emitRemoteThreadCommand: dispatchThreadCommand,
      getSharedSettings,
      reportError: options.reportError,
      publishProjectsChanged,
      writeSharedSettings: (next) => {
        if (!desktop) return;
        // Routed through the settings authority as scoped CAS edits; the
        // committed broadcast happens from the authority's onCommitted hook.
        this.settings.writeSharedSettingsCompat(next);
      },
      editSettingsField: (field, compute) => this.settings.editSettingsField(field, compute),
      // TODO(Gates 2-3 Batch 1, Lane 1B — S2.1): this is hardcoded `true`, so
      // app-controls reports a renderer window even in tray/hidden mode and
      // callers believe zero-window thread-command mirrors were delivered.
      // Main now queues those commands until a window is ready
      // (flushPendingThreadCommands) as the interim fix; when this becomes a
      // real window signal (and/or the backend applies commands DB-direct
      // zero-window), main's queue can be removed.
      hasRendererWindow: true,
      openThreadInUi: (threadId) => {
        // Fire-and-forget: the durable side only needs the acknowledgment.
        // Without an explicit settlement a rejection would escape as an
        // unhandled rejection and tear down the shared backend process.
        void options.requestNative({ operation: "open-thread", payload: { threadId } }).then(
          () => undefined,
          (error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            options.reportError(
              new Error(`Failed to open thread "${threadId}" in the desktop UI: ${detail}`),
              {
                "poracode.feature_area": "remote-access",
              },
            );
          },
        );
        return true;
      },
      notifyUser: async (payload) => {
        const delivered = await options.requestNative({ operation: "notify-user", payload });
        return delivered === true
          ? { delivered: true }
          : { delivered: false, note: "The operating system did not show the notification." };
      },
      checkForUpdate: async () => {
        await options.requestNative({ operation: "check-for-update", payload: {} });
        return {
          supported: true,
          currentVersion: initialize.supervisor.appVersion,
          ...(this.updateStatus ? { status: this.updateStatus.type } : {}),
          ...((this.updateStatus?.type === "update-available" ||
            this.updateStatus?.type === "downloaded") &&
          "version" in this.updateStatus
            ? { availableVersion: this.updateStatus.version }
            : {}),
        };
      },
      onGitPatch: (patch) => {
        this.remote?.getServer()?.publishSupervisorEvent({ type: "remote-git-state", patch });
        options.emitNativeEvent({ type: "git-state-changed", patch });
      },
      onPrMerged: (watch) =>
        options.emitNativeEvent({
          type: "pr-watch-merged",
          event: {
            projectId: watch.projectId,
            prNumber: watch.prNumber,
            ...(watch.worktreePath ? { worktreePath: watch.worktreePath } : {}),
          },
        }),
      onPrObserved: (watch, pr, details) => {
        options.emitNativeEvent({
          type: "pr-watch-status",
          event: {
            projectId: watch.projectId,
            prNumber: watch.prNumber,
            headBranch: watch.headBranch,
            ...(watch.worktreePath ? { worktreePath: watch.worktreePath } : {}),
            pr,
            ...(details ? { details } : {}),
          },
        });
      },
    });

    this.remote = desktop
      ? createDesktopRemoteAccessController({
          appVersion: initialize.supervisor.appVersion,
          channel: desktop.channel,
          paths: { baseDir: initialize.baseDir, settingsPath: desktop.settingsPath },
          ...(desktop.devServerUrl ? { devServerUrl: desktop.devServerUrl } : {}),
          ...(desktop.hostCapabilities ? { hostCapabilities: desktop.hostCapabilities } : {}),
          callSupervisor: (name, payload) => supervisor.call(name, payload),
          truncateThreadRuntime: (threadId, itemId) => {
            host.truncateThreadRuntime(threadId, itemId);
          },
          revertCheckpoint: async (input) => {
            try {
              return await host.revertCheckpoint(input);
            } catch (error) {
              if (error instanceof RevertCheckpointRefusedError) {
                throw new RemoteHttpError("thread_turn_active", error.message, 409);
              }
              throw error;
            }
          },
          dispatchThreadCommand,
          browser: this.browser,
          // The controller's settings patches commit through the same authority
          // as every other writer; the committed broadcast happens in the
          // authority's onCommitted hook.
          settingsWrites: {
            commitCompatPatch: (patch) => this.settings.commitCompatPatch(patch),
            editSettingsField: (field, compute) => this.settings.editSettingsField(field, compute),
          },
          notifyRemoteAccessPairingChanged: (info) =>
            options.emitNativeEvent({ type: "remote-access-pairing-changed", info }),
          notifyProjectStateChanged: (projects) =>
            options.emitNativeEvent({ type: "projects-changed", projects: [...projects] }),
          notifyUserNotification: (notification) =>
            options.emitNativeEvent({ type: "user-notification", notification }),
          notifyEventInterestsChanged: options.setRemoteEventInterests,
          imagePreviewGenerator: generateBackendImagePreview,
          reportError: options.reportError,
          scheduleService: this.durable.scheduleService,
          prWatchService: this.durable.prWatchService,
          gitStateService: this.durable.gitStateService,
          updates: {
            currentVersion: () => initialize.supervisor.appVersion,
            status: () => this.updateStatus,
            check: () =>
              options
                .requestNative({ operation: "check-for-update", payload: {} })
                .then(() => undefined),
            install: () => {
              // Fire-and-forget: the updater surfaces progress on its own; a
              // rejection here must still be settled so it cannot become an
              // unhandled rejection in the shared backend process.
              void options.requestNative({ operation: "install-update", payload: {} }).then(
                () => undefined,
                (error: unknown) => {
                  const detail = error instanceof Error ? error.message : String(error);
                  options.reportError(
                    new Error(`Failed to install the pending update: ${detail}`),
                    {
                      "poracode.feature_area": "updates",
                    },
                  );
                },
              );
            },
          },
        })
      : null;
  }

  getSupervisorExtraEnv(): Record<string, string> {
    return this.durable.getSupervisorExtraEnv();
  }

  /**
   * Supervisor start-up must wait for the app-controls ingress: the child
   * resolves its extra env (the MCP URL/token) at spawn. Ownership is the
   * durable layer's single-flight start — a failed attempt is retried here on
   * the next supervisor start rather than latched off.
   */
  async prepareSupervisor(): Promise<void> {
    await this.durable.startIngress();
  }

  async startBackgroundServices(): Promise<void> {
    this.durable.startBackgroundServices();
    await this.remote?.startIfEnabled();
  }

  observeSupervisorEvent(event: SupervisorEvent): boolean {
    if (this.durable.observeSupervisorEvent(event)) return true;
    this.remote?.handleSupervisorEvent(event);
    return false;
  }

  /**
   * The supervisor process restarted; its in-session state is gone. Mirrors
   * the headless host: drop cached background-task levels so stale entries
   * cannot shadow the fresh supervisor's live reads.
   */
  handleSupervisorReset(): void {
    this.remote?.handleSupervisorReset();
  }

  publishBrowserEvent(event: import("@/shared/backendHostProtocol").BackendBrowserEvent): void {
    this.browser.publish(event);
  }

  markLiveThreadsInactive(): SupervisorEvent[] {
    const threads = dbGetThreads();
    const interrupted = threads.filter((thread) => isThreadTurnActive(thread.status));
    dbMarkLiveThreadsInactive();
    return [
      ...threads.map<SupervisorEvent>((thread) => ({
        type: "thread-follow-up-queue",
        threadId: thread.id,
        queue: null,
      })),
      ...interrupted.map<SupervisorEvent>((thread) => ({
        type: "thread-state",
        threadId: thread.id,
        status: "inactive",
        attention: "none",
        canResumeWithConfig: thread.canResumeWithConfig,
      })),
    ];
  }

  databaseChanged(call: BackendDatabaseCall): void {
    if (!affectsShellProjection(call.name)) return;
    // A row-scoped sync (dbSyncChanges) may carry only a view update; the
    // payload tells whether any project or thread rows actually changed.
    const changedProjects =
      call.name === "dbUpsertProject" ||
      call.name === "dbDeleteProject" ||
      call.name === "dbSyncAll" ||
      (call.name === "dbSyncChanges" &&
        (call.payload.projects.length > 0 || call.payload.deletedProjectIds.length > 0));
    const changedThreads =
      call.name === "dbUpsertThread" ||
      call.name === "dbDeleteThread" ||
      call.name === "dbSyncAll" ||
      call.name === "dbPersistExperimentState" ||
      (call.name === "dbSyncChanges" &&
        (call.payload.threads.length > 0 || call.payload.deletedThreadIds.length > 0));
    if (changedProjects) {
      const projects = dbGetProjects();
      this.remote?.getServer()?.publishSupervisorEvent({
        type: "remote-projects-changed",
        projects: remoteProjectCommandResultSchema.parse({ projects }).projects,
      });
    }
    if (changedThreads) {
      this.remote?.getServer()?.publishSupervisorEvent({
        type: "remote-threads-changed",
        threadIds: dbGetThreads().map((thread) => thread.id),
      });
    }
  }

  call<Name extends BackendServiceProcedureName>(
    name: Name,
    payload: Extract<BackendServiceCall, { name: Name }>["payload"],
  ): BackendServiceResult<Name> | Promise<BackendServiceResult<Name>> {
    switch (name) {
      case "getSharedSettings":
      case "setSharedSettings":
      case "settingsTransactionMutate":
      case "settingsTransactionSnapshot":
      case "setAgentSecretSetting":
      case "removeCrossagentRoutingOverride":
      case "removeCrossagentMemoryEntry":
      case "updateCrossagentMemoryEntryTags":
      case "setProfileEnvironment":
      case "createProfile":
        return this.settings.call(
          name as BackendSettingsProcedureName,
          payload as never,
        ) as unknown as BackendServiceResult<Name>;
      case "getRemoteAccessPairing":
        // User-facing pairing surface: the always-on loopback-only instance
        // reports `disabled` so it stays undiscoverable (V5 plan 2.5).
        return (this.remote?.getPairingInfo() ??
          getRemoteAccessPairingInfo(null)) as BackendServiceResult<Name>;
      case "getManagedLoopbackBootstrap":
        return (
          this.remote?.getManagedLoopbackBootstrap() ??
          (Promise.resolve(null) as Promise<BackendServiceResult<Name>>)
        );
      case "refreshRemoteAccessPairing": {
        // Refresh mints/rotates the DISPLAYED QR credential — only meaningful
        // when remote access is user-enabled (V5 plan 2.5 gating).
        if (!this.remote?.isUserEnabled()) {
          return (
            this.remote?.getPairingInfo() ??
            (getRemoteAccessPairingInfo(null) as BackendServiceResult<Name>)
          );
        }
        const server = this.remote?.getServer();
        const preset = (payload as { preset?: "operator" | "viewer" }).preset;
        server?.issuePairingUrl("Settings QR", preset ? { preset } : undefined);
        return (this.remote?.getPairingInfo() ??
          getRemoteAccessPairingInfo(server ?? null)) as BackendServiceResult<Name>;
      }
      case "setRemoteAccessEnabled":
        return this.requireRemote().setEnabled(
          (payload as { enabled: boolean }).enabled,
        ) as Promise<BackendServiceResult<Name>>;
      case "getRemoteAccessTailscaleStatus":
        return this.requireRemote().getTailscaleStatus() as Promise<BackendServiceResult<Name>>;
      case "setRemoteAccessTailscaleHttps":
        return this.requireRemote().setTailscaleHttps(
          (payload as { enabled: boolean }).enabled,
        ) as Promise<BackendServiceResult<Name>>;
      case "startTailscale":
        return this.requireRemote().startTailscale() as Promise<BackendServiceResult<Name>>;
      case "setRemoteAccessAdvertisedUrl":
        return this.requireRemote().setAdvertisedUrl((payload as { url: string }).url) as Promise<
          BackendServiceResult<Name>
        >;
      case "revokeRemoteAccessSession": {
        const revoked =
          this.remote
            ?.getServer()
            ?.revokeAccessSession((payload as { sessionId: string }).sessionId) ?? false;
        return { revoked } as BackendServiceResult<Name>;
      }
      case "publishRemoteGitSummaries":
        this.remote?.updateGitSummaries((payload as { summaries: never }).summaries);
        return undefined as BackendServiceResult<Name>;
      case "getSchedules":
        return this.durable.scheduleService.list() as BackendServiceResult<Name>;
      case "createSchedule":
        return this.durable.scheduleService.create(payload as never) as BackendServiceResult<Name>;
      case "updateSchedule": {
        const input = payload as { id: string; task: never };
        return this.durable.scheduleService.update(
          input.id,
          input.task,
        ) as BackendServiceResult<Name>;
      }
      case "deleteSchedule":
        this.durable.scheduleService.delete((payload as { id: string }).id);
        return undefined as BackendServiceResult<Name>;
      case "runScheduleNow":
        return this.durable.scheduleService.runNow(
          (payload as { id: string }).id,
        ) as BackendServiceResult<Name>;
      case "getPrWatch": {
        const input = payload as { projectId: string; prNumber: number };
        return this.durable.prWatchService.get(
          input.projectId,
          input.prNumber,
        ) as BackendServiceResult<Name>;
      }
      case "checkPrWatch": {
        const input = payload as { projectId: string; prNumber: number };
        this.durable.prWatchService.requestCheck(input.projectId, input.prNumber);
        return undefined as BackendServiceResult<Name>;
      }
      case "upsertPrWatch":
        return this.durable.prWatchService.upsert(payload as never) as BackendServiceResult<Name>;
      case "deletePrWatch": {
        const input = payload as { projectId: string; prNumber: number };
        this.durable.prWatchService.delete(input.projectId, input.prNumber);
        return undefined as BackendServiceResult<Name>;
      }
      case "syncPrWatchAgent":
        this.durable.prWatchService.syncAgent(payload as never);
        return undefined as BackendServiceResult<Name>;
      case "getProfileCoreStats":
        return getProfileCoreStats(payload as never) as BackendServiceResult<Name>;
      case "getProfileTokenStats":
        return getProfileTokenStats(payload as never) as BackendServiceResult<Name>;
      case "getProfileDevices":
        return getProfileDevicesResponse() as BackendServiceResult<Name>;
      case "getProfileIdentity":
        return getProfileIdentityResponse() as BackendServiceResult<Name>;
      case "setProfileIdentity":
        return setProfileIdentityResponse(payload as never) as BackendServiceResult<Name>;
      case "updateStatusChanged":
        this.updateStatus = (payload as { status: RemoteHostUpdateStatus | null }).status;
        return undefined as BackendServiceResult<Name>;
      case "requestLegacyDataMigration":
        return requestLegacyDataMigration(payload as never) as BackendServiceResult<Name>;
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    const barrier = Promise.withResolvers<void>();
    this.disposal = barrier.promise;
    void joinRuntimeShutdown(
      [
        () => this.stopProjectionWatch(),
        () => this.durable.dispose(),
        () => this.browser.dispose(),
        () => this.remote?.dispose(),
        // Drains any queued authority commit before the process closes the file.
        () => this.settings.dispose(),
      ],
      "Backend desktop services did not shut down cleanly.",
    ).then(barrier.resolve, barrier.reject);
    return this.disposal;
  }

  private requireRemote(): DesktopRemoteAccessController {
    if (!this.remote) throw new Error("Desktop remote access is not configured.");
    return this.remote;
  }
}
