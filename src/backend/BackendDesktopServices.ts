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
import { getRemoteAccessPairingInfo } from "@/main/remote/pairingInfo";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileIdentityResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "@/main/profile";
import { readSharedSettingsFile, writeSharedSettingsFile } from "@/main/sharedSettingsFile";
import { readOrCreateRemoteAccessIdentity } from "@/main/remote/identity";
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
} from "@/shared/backendHostProtocol";
import type { BackendHostCore } from "./BackendHostCore";
import { BackendDurableServices } from "./BackendDurableServices";
import { BackendRemoteBrowserProxy } from "./BackendRemoteBrowserProxy";
import { generateBackendImagePreview } from "./BackendImagePreview";

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
  private readonly durable: BackendDurableServices;
  private readonly remote: DesktopRemoteAccessController | null;
  private readonly browser: BackendRemoteBrowserProxy;
  private readonly stopProjectionWatch: () => void;
  private updateStatus: RemoteHostUpdateStatus | null = null;
  private started = false;

  constructor(private readonly options: BackendDesktopServicesOptions) {
    const { initialize, host } = options;
    const desktop = initialize.desktop;
    const supervisor = host.supervisorClient;
    this.browser = new BackendRemoteBrowserProxy(options.requestNative);
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
      publishProjectsChanged,
      writeSharedSettings: (next) => {
        if (!desktop) return;
        writeSharedSettingsFile(desktop.settingsPath, next);
        options.emitNativeEvent({ type: "shared-settings-changed", settings: next });
      },
      hasRendererWindow: true,
      openThreadInUi: (threadId) => {
        void options.requestNative({ operation: "open-thread", payload: { threadId } });
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
          callSupervisor: (name, payload) => supervisor.call(name, payload),
          dispatchThreadCommand,
          browser: this.browser,
          notifySharedSettingsChanged: (settings) =>
            options.emitNativeEvent({ type: "shared-settings-changed", settings }),
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
              void options.requestNative({ operation: "install-update", payload: {} });
            },
          },
        })
      : null;
  }

  getSupervisorExtraEnv(): Record<string, string> {
    return this.durable.getSupervisorExtraEnv();
  }

  async prepareSupervisor(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.durable.startIngress();
  }

  async startBackgroundServices(): Promise<void> {
    this.durable.startBackgroundServices();
    await this.remote?.startIfEnabled();
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    this.durable.observeSupervisorEvent(event);
    this.remote?.handleSupervisorEvent(event);
  }

  publishBrowserEvent(event: import("@/shared/backendHostProtocol").BackendBrowserEvent): void {
    this.browser.publish(event);
  }

  markLiveThreadsInactive(): SupervisorEvent[] {
    const interrupted = dbGetThreads().filter((thread) => isThreadTurnActive(thread.status));
    dbMarkLiveThreadsInactive();
    return interrupted.map((thread) => ({
      type: "thread-state",
      threadId: thread.id,
      status: "inactive",
      attention: "none",
      canResumeWithConfig: thread.canResumeWithConfig,
    }));
  }

  databaseChanged(call: BackendDatabaseCall): void {
    if (!affectsShellProjection(call.name)) return;
    if (
      call.name === "dbUpsertProject" ||
      call.name === "dbDeleteProject" ||
      call.name === "dbSyncAll"
    ) {
      const projects = dbGetProjects();
      this.remote?.getServer()?.publishSupervisorEvent({
        type: "remote-projects-changed",
        projects: remoteProjectCommandResultSchema.parse({ projects }).projects,
      });
    }
    if (
      call.name === "dbUpsertThread" ||
      call.name === "dbDeleteThread" ||
      call.name === "dbSyncAll" ||
      call.name === "dbPersistExperimentState"
    ) {
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
      case "getRemoteAccessPairing":
        return getRemoteAccessPairingInfo(
          this.remote?.getServer() ?? null,
        ) as BackendServiceResult<Name>;
      case "refreshRemoteAccessPairing": {
        const server = this.remote?.getServer();
        server?.issuePairingUrl("Settings QR");
        return getRemoteAccessPairingInfo(server ?? null) as BackendServiceResult<Name>;
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

  async dispose(): Promise<void> {
    this.stopProjectionWatch();
    await this.remote?.dispose();
    this.durable.dispose();
    this.browser.dispose();
  }

  private requireRemote(): DesktopRemoteAccessController {
    if (!this.remote) throw new Error("Desktop remote access is not configured.");
    return this.remote;
  }
}
