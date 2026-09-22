import { dbGetThreads, dbMarkLiveThreadsInactive, onProjectThreadDataChanged } from "@/host/db";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { runOwnedExperimentWorktreePreparation } from "@/host/remote/experimentOwnership";
import { SupervisorUnavailableError } from "@/host/supervisor/SupervisorClient";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorEvent,
  SupervisorProcedureName,
} from "@/shared/ipc";
import {
  RUNTIME_GAP_ACKNOWLEDGED_RESYNC_REASON,
  createRuntimeHistoryGapPort,
} from "@/host/remote/runtimeHistoryGapComposition";
import {
  createDesktopRemoteAccessController,
  type DesktopRemoteAccessController,
} from "@/backend/remote/DesktopRemoteAccessController";
import { RemoteHttpError } from "@/host/remote/auth";
import { getRemoteAccessPairingInfo } from "@/host/remote/pairingInfo";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileIdentityResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "@/host/profile";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { readOrCreateRemoteAccessIdentity } from "@/host/remote/identity";
import { requestLegacyDataMigration } from "@/host/legacyDataMigration";
import {
  isThreadTurnActive,
  type CreateExperimentWorktreesPayload,
  type RemoteThreadCommand,
} from "@/shared/contracts";
import { type RemoteHostUpdateStatus } from "@/shared/remote";
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
import type { EnvironmentRuntimeService } from "@/host/environments/environmentRuntimeService";

export interface BackendDesktopServicesOptions {
  initialize: BackendHostInitializePayload;
  host: BackendHostCore;
  /** Backend composition owns its disposal and data custody. */
  environments?: EnvironmentRuntimeService;
  requestNative(request: BackendNativeRequest): Promise<unknown>;
  emitNativeEvent(event: BackendNativeEvent): void;
  reportError(
    error: unknown,
    tags?: import("@/shared/diagnostics/sentryPrivacy").PoracodeDiagnosticTags,
  ): void;
}

/**
 * A2 interim: the remote server still reports its per-client interest union to
 * its composition, but nothing consumes it once the backend→main relay is
 * gone. The callback stays wired and this sink deliberately ignores it; the
 * remote-side removal belongs to the B3-owned `RemoteAccessServer` /
 * `remoteAccessServerWs` slice and is recorded as a remaining follow-up — it
 * is not claimed done.
 */
function ignoreRemoteEventInterests(): void {}

const SHELL_PROJECTION_DATABASE_CALLS: ReadonlySet<BackendDatabaseCall["name"]> = new Set([
  "dbUpsertProject",
  "dbDeleteProject",
  "dbUpsertThread",
  "dbDeleteThread",
  "dbSyncAll",
  "dbSyncChanges",
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
    // Experiment authority: composed ONLY for the embedded desktop backend,
    // which owns the local-shell experiment worktree driver. The port reuses
    // the existing supervisor seams; its presence is the capability gate, so a
    // composition without it (headless/helper) advertises nothing and answers
    // 501 — never a `hostMode` branch.
    const experimentAuthority = desktop
      ? {
          runThreadMutation: <Result>(threadId: string, operation: () => Promise<Result>) =>
            supervisor.runThreadMutation(threadId, operation),
          retireThread: async (threadId: string): Promise<boolean> => {
            try {
              const result = await supervisor.call(
                "closeThreadConfirmed",
                { threadId },
                { startIfNeeded: false },
              );
              return result.confirmed;
            } catch (error) {
              if (
                error instanceof SupervisorUnavailableError &&
                supervisor.isSupervisorProvenAbsent()
              ) {
                return true;
              }
              throw error;
            }
          },
        }
      : undefined;
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
      // The project data plane is the server's own `remote-projects-changed`
      // membership event (the desktop consumes its loopback WS); there is no
      // second bulk copy across the backend→main→renderer hop. The server
      // decides once whether the catalog must actually be read: with no legacy
      // subscriber it publishes the bounded signal alone.
      this.remote?.getServer()?.publishCatalogChanged();
    };

    this.durable = new BackendDurableServices({
      appVersion: initialize.supervisor.appVersion,
      hostId: readOrCreateRemoteAccessIdentity(initialize.baseDir).desktopId,
      supervisor,
      // The local attachments root this backend child owns (the same promoted
      // root main writes into on managed): its durable services run the one
      // deleted-thread attachment reclaimer for it.
      attachmentsDir: resolvePoracodePaths(initialize.baseDir).attachmentsDir,
      sendThreadCommand,
      emitRemoteThreadCommand: dispatchThreadCommand,
      getSharedSettings,
      reportError: options.reportError,
      publishProjectsChanged,
      publishThreadsChanged: (threadIds) => {
        // H3: the server's shared publisher bounds the membership batches, so
        // even an all-id host-local projection cannot emit an over-cap event.
        this.remote?.getServer()?.publishThreadsChanged(threadIds);
      },
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
          ...(desktop.hostCapabilities
            ? {
                hostCapabilities: {
                  ...desktop.hostCapabilities,
                  ssh: Boolean(options.environments),
                },
              }
            : {}),
          ...(options.environments ? { environments: options.environments } : {}),
          callSupervisor: (name, payload) => supervisor.call(name, payload),
          peekResourceAdmissionStatus: () => supervisor.peekResourceAdmissionStatus(),
          truncateThreadRuntime: (threadId, itemId) => {
            host.truncateThreadRuntime(threadId, itemId);
          },
          // B1: the desktop backend host owns the durable gap/notice store, so
          // the remote server advertises the capability and serves real state.
          runtimeHistoryGap: createRuntimeHistoryGapPort(host),
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
          ...(experimentAuthority ? { experimentAuthority } : {}),
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
          // Host-local project writes that do not pass through the HTTP command
          // routes (project-scoped MCP settings) publish the same bounded
          // membership event every other project mutation uses. The rows are
          // already in hand, so the declaration-aware publisher avoids a
          // duplicate read and skips the wire parse when nothing consumes the
          // full list. No full Project[] crosses the backend→main hop.
          notifyProjectStateChanged: (projects) => {
            this.remote?.getServer()?.publishCatalogChangedRows(projects);
          },
          notifyUserNotification: (notification) =>
            options.emitNativeEvent({ type: "user-notification", notification }),
          notifyEventInterestsChanged: ignoreRemoteEventInterests,
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
    // Reconnection is host-owned and bounded by the runtime, but unreachable
    // children must not hold the local listener or renderer startup hostage.
    void this.options.environments?.start().catch(this.options.reportError);
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

  /**
   * The supervisor shed terminal-output batches in transit, so those bytes
   * never persisted. Remote clients resync from the supervisor's
   * authoritative PTY scrollback through the WS `resync-required` path —
   * headless parity. There is no main-side consumer to notify: the former
   * `thread-scrollback-resync` relay event was dead after V6 B.6 and was
   * deleted with the relay (A2).
   */
  handleSupervisorOutputShed(): void {
    this.remote
      ?.getServer()
      ?.broadcastResyncRequired(
        "Terminal output was shed under backpressure; resynchronize from the host.",
      );
  }

  /**
   * B1: an applied runtime-gap acknowledgement committed in this backend host.
   * Publication only — the durable acknowledgement already cleared the episode,
   * the local renderer receives the core's `thread-reset`, and connected
   * remote clients are told to resync authoritative history (capable clients
   * render the notice; incapable readers are refused 409). This NEVER re-enters
   * supervisor-event persistence, so committed transcript bytes are untouched.
   */
  handleRuntimeGapAcknowledged(_threadId: string): void {
    this.remote?.getServer()?.broadcastResyncRequired(RUNTIME_GAP_ACKNOWLEDGED_RESYNC_REASON);
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
      (call.name === "dbSyncChanges" &&
        (call.payload.threads.length > 0 || call.payload.deletedThreadIds.length > 0));
    if (changedProjects) {
      this.remote?.getServer()?.publishCatalogChanged();
    }
    if (changedThreads) {
      this.remote?.getServer()?.publishThreadsChanged(dbGetThreads().map((thread) => thread.id));
    }
  }

  /**
   * Guarded pass-through for renderer-initiated supervisor calls. The only
   * guarded procedure is the experiment worktree preparation: the renderer
   * persists the experiment record before invoking it, so an ownership check
   * refuses a DELAYED preparation whose record was removed (creating its
   * worktrees would orphan them), registers an IN-FLIGHT preparation with the
   * project-removal guard (so a concurrent removal drains it before its own
   * worktree teardown), and refuses a preparation for a project already being
   * removed. Everything else is a plain supervisor call.
   */
  callSupervisor<Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    const dispatch = (): Promise<IpcProcedureResult<Name>> =>
      this.options.host.supervisorClient.call(name, payload);
    if (name !== "createExperimentWorktrees") return dispatch();
    return runOwnedExperimentWorktreePreparation(
      payload as CreateExperimentWorktreesPayload,
      dispatch,
    );
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
