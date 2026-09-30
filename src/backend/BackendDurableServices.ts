import { joinRuntimeShutdown } from "./joinRuntimeShutdown";
import {
  dbDeleteThread,
  dbGetProject,
  dbGetProjectNotes,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbInsertScheduleRun,
  dbInterruptScheduleRuns,
  dbListThreadIds,
  dbUpdateScheduleRun,
  dbUpsertThread,
  onThreadsDeleted,
} from "@/host/db";
import { AttachmentReclaimService } from "@/host/attachments/attachmentReclaim";
import {
  AppControlsMcpIngress,
  buildSharedAppControlsIngressDeps,
  createAppControlsSupervisorCaller,
} from "@/host/app-controls";
import type { AppControlsMcpIngressDeps } from "@/host/app-controls/AppControlsMcpIngress";
import { ensureHomeProjectWithPublish } from "@/host/app-controls/ingressDeps";
import { createGitStateExecutor, GitStateService } from "@/host/gitState";
import {
  buildPrWatchExecutionDeps,
  createDevicePrWatchService,
  type PrWatchService,
} from "@/host/prWatch";
import {
  createDeviceScheduleService,
  ScheduleRunCoordinator,
  type ScheduleService,
} from "@/host/schedules";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import { SupervisorUnavailableError } from "@/host/supervisor/SupervisorClient";
import type { PrData, PrDetails, PrWatch, RemoteThreadCommand } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import type { GitStatePatch } from "@/shared/gitState";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import { observeRoutingSettingsEvent } from "./BackendRoutingSettings";
import { runThreadHousekeeping } from "./ThreadHousekeepingService";

export interface BackendDurableServicesOptions {
  appVersion: string;
  hostId: string;
  supervisor: SupervisorClient;
  getSharedSettings(): SharedSettings;
  /** Compat whole-snapshot write (app-controls `update_settings`). Routed
   * through the composition's settings authority as scoped CAS edits; a
   * rejection is reported instead of thrown, so fire-and-forget callers cannot
   * turn a durable event into an unhandled rejection. */
  writeSharedSettings(settings: SharedSettings): void;
  /** Trusted single-field CAS edit for owner-managed records (learned routing
   * usage, overrides). Backed by the composition's settings authority. */
  editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult>;
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  emitRemoteThreadCommand?(command: RemoteThreadCommand): boolean | Promise<boolean>;
  publishProjectsChanged(): void;
  /**
   * Publish a bounded thread invalidation for host-local writes (MCP metadata
   * updates and create_thread, schedule-created/rolled-back rows). Wired by the
   * composition to the remote server's `publishThreadsChanged`
   * (`remote-threads-changed`). Optional so legacy/test composition keeps its
   * current behavior.
   */
  publishThreadsChanged?(threadIds: readonly string[]): void;
  /**
   * Attachments root for deleted-thread directory reclamation. Canonical host
   * paths come from the composition; when present, this class owns the one
   * reclaimer for that root: it subscribes to the DB layer's postcommit
   * deleted-thread seam, runs the startup backlog scan, and joins/cancels its
   * work on dispose. Optional so test/legacy compositions keep today's
   * behavior.
   */
  attachmentsDir?: string;
  hasRendererWindow: boolean;
  openThreadInUi(threadId: string): boolean;
  notifyUser: AppControlsMcpIngressDeps["notifyUser"];
  checkForUpdate: AppControlsMcpIngressDeps["checkForUpdate"];
  onPrMerged?(watch: PrWatch): void;
  onPrObserved?(watch: PrWatch, pr: PrData, details?: PrDetails): void;
  onGitPatch(patch: GitStatePatch): void;
  reportError?(error: unknown): void;
}

/** Shared durable service graph used by both desktop BackendHost and headless server. */
export class BackendDurableServices {
  private disposed = false;
  private disposal: Promise<void> | null = null;
  /** Owned attachment reclaimer (see `attachmentsDir`); null when unwired. */
  private readonly attachmentReclaim: AttachmentReclaimService | null;
  private unsubscribeThreadsDeleted: (() => void) | null = null;
  readonly scheduleCoordinator: ScheduleRunCoordinator;
  readonly scheduleService: ScheduleService;
  readonly prWatchService: PrWatchService;
  readonly gitStateService: GitStateService;
  readonly appControls: AppControlsMcpIngress;
  /** Settled or in-flight shared ingress start; cleared on failure so it can retry. */
  private ingressStart: Promise<void> | null = null;
  private backgroundStarted = false;
  private housekeepingStarted = false;
  /**
   * H4: set synchronously by {@link dispose}. The sweep checks it before every
   * candidate read/retirement and after every await, so cancellation stops
   * further DB work immediately and the in-flight operation is joined before
   * the owner's database closes.
   */
  private housekeepingCancelled = false;
  /** Settled-or-in-flight boot sweep, joined by {@link dispose}. */
  private housekeepingRun: Promise<void> | null = null;

  constructor(private readonly options: BackendDurableServicesOptions) {
    const { supervisor } = options;
    this.scheduleCoordinator = new ScheduleRunCoordinator({
      startThread: (payload) => supervisor.call("startThread", payload),
      getAgentStatuses: (wslDistros) => supervisor.call("getAgentStatuses", { wslDistros }),
      sendThreadCommand: options.sendThreadCommand,
      // A scheduled run may create the Home project row; publish the project
      // change so remote membership sees host-local project creation.
      ensureHomeProject: () => ensureHomeProjectWithPublish(options.publishProjectsChanged),
      getProject: dbGetProject,
      getSharedSettings: options.getSharedSettings,
      upsertThread: dbUpsertThread,
      deleteThread: dbDeleteThread,
      threadExists: (threadId) => dbGetThread(threadId) != null,
      ...(options.publishThreadsChanged
        ? { publishThreadsChanged: options.publishThreadsChanged }
        : {}),
      insertRun: dbInsertScheduleRun,
      updateRun: dbUpdateScheduleRun,
    });
    this.scheduleService = createDeviceScheduleService({
      runTask: (task) => this.scheduleCoordinator.runScheduleAsThread(task),
      onStartupInterrupted: (scheduleId) =>
        dbInterruptScheduleRuns(scheduleId, new Date().toISOString()),
    });

    const sharedAppControlsDeps = buildSharedAppControlsIngressDeps({
      call: (name, payload) => supervisor.call(name, payload),
      sendThreadCommand: options.sendThreadCommand,
      getSharedSettings: options.getSharedSettings,
      publishProjectsChanged: options.publishProjectsChanged,
      ...(options.publishThreadsChanged
        ? { publishThreadsChanged: options.publishThreadsChanged }
        : {}),
    });
    this.gitStateService = new GitStateService({
      hostId: options.hostId,
      executor: createGitStateExecutor((name, payload) => supervisor.call(name, payload)),
      getProject: dbGetProject,
      onPatch: options.onGitPatch,
    });
    this.prWatchService = createDevicePrWatchService({
      getProject: dbGetProject,
      getPrForBranch: (project, branch) =>
        supervisor.call("ghGetPrForBranch", { projectLocation: project.location, branch }),
      getPrDetails: (project, prNumber) =>
        supervisor
          .call("ghGetPrDetails", { projectLocation: project.location, prNumber })
          .then((result) => result.details),
      getPrReviewThreads: (project, prNumber) =>
        supervisor
          .call("ghGetPrReviewComments", { projectLocation: project.location, prNumber })
          .then((result) => result.threads),
      getMergeMethod: () => options.getSharedSettings().prMergeMethod,
      mergePr: (project, prNumber, method) =>
        supervisor.call("ghMergePr", {
          projectLocation: project.location,
          prNumber,
          method,
          admin: false,
        }),
      ...(options.onPrMerged ? { onPrMerged: options.onPrMerged } : {}),
      onPrObserved: (watch, pr, details) => {
        options.onPrObserved?.(watch, pr, details);
        this.gitStateService.applyObservedPullRequest(watch, pr, details);
      },
      createThread: sharedAppControlsDeps.createThread,
      isThreadActive: (threadId) => {
        const status = dbGetThread(threadId)?.status;
        return status !== undefined && isThreadTurnActive(status);
      },
      ...buildPrWatchExecutionDeps({
        call: (name, payload) => supervisor.call(name, payload),
        getSharedSettings: options.getSharedSettings,
      }),
    });
    this.appControls = new AppControlsMcpIngress({
      scheduleService: this.scheduleService,
      getThread: dbGetThread,
      getThreads: dbGetThreads,
      getProjects: dbGetProjects,
      getProject: dbGetProject,
      getProjectNotes: dbGetProjectNotes,
      ...sharedAppControlsDeps,
      ...(options.reportError ? { reportError: options.reportError } : {}),
      settings: {
        read: options.getSharedSettings,
        write: options.writeSharedSettings,
      },
      getAppInfo: () => ({
        version: options.appVersion,
        platform: process.platform,
        hasRendererWindow: options.hasRendererWindow,
      }),
      supervisor: createAppControlsSupervisorCaller((name, payload) =>
        supervisor.call(name, payload),
      ),
      emitRemoteThreadCommand: options.emitRemoteThreadCommand ?? options.sendThreadCommand,
      openThreadInUi: options.openThreadInUi,
      notifyUser: options.notifyUser,
      checkForUpdate: options.checkForUpdate,
    });
    if (options.attachmentsDir) {
      this.attachmentReclaim = new AttachmentReclaimService({
        attachmentsDir: options.attachmentsDir,
        listLiveThreadIds: dbListThreadIds,
        ...(options.reportError ? { reportError: options.reportError } : {}),
      });
      this.unsubscribeThreadsDeleted = onThreadsDeleted((threadIds) => {
        this.attachmentReclaim?.notifyDeletedThreadIds(threadIds);
      });
      this.attachmentReclaim.start();
    } else {
      this.attachmentReclaim = null;
    }
  }

  getSupervisorExtraEnv(): Record<string, string> {
    if (this.disposed) return {};
    const info = this.appControls.getInfo();
    return info
      ? {
          PORACODE_APP_CONTROLS_MCP_URL: info.url,
          PORACODE_APP_CONTROLS_MCP_TOKEN: info.token,
        }
      : {};
  }

  /**
   * Single-flight start of the app-controls ingress. Concurrent callers share
   * one attempt, and a failed attempt is forgotten so a later caller retries
   * it instead of being locked out forever — supervisor start-up is gated on
   * this (the child only receives the app-controls MCP env when ingress is
   * already up), so a swallowed failure here would leave the device
   * permanently ingress-less.
   */
  startIngress(): Promise<void> {
    if (this.disposed)
      return Promise.reject(new Error("Backend durable services are shutting down."));
    this.ingressStart ??= this.appControls.start().then(
      () => undefined,
      (error: unknown) => {
        this.ingressStart = null;
        throw error;
      },
    );
    return this.ingressStart;
  }

  startBackgroundServices(): void {
    if (this.disposed || this.backgroundStarted) return;
    this.backgroundStarted = true;
    this.scheduleService.start();
    this.prWatchService.start();
    this.gitStateService.start();
    this.startThreadHousekeeping();
  }

  /**
   * One host-policy housekeeping sweep at boot: archive done rows past the
   * configured window, purge archived rows past 30 days through the custody
   * delete, publish the bounded membership event. Fire-and-forget — readiness
   * never waits on it, a row-level refusal only skips that row, and a failure
   * leaves every row as-is for the next boot. It runs once per host process
   * and is never re-triggered by a settings change.
   *
   * H4: the run is retained and joined by {@link dispose}; cancellation is
   * checked per candidate and after every await so a held retirement can never
   * touch the database or publish after the owner began closing.
   */
  startThreadHousekeeping(): void {
    if (this.disposed || this.housekeepingStarted) return;
    this.housekeepingStarted = true;
    const run = runThreadHousekeeping({
      getAutoArchiveDoneAfterDays: () => this.options.getSharedSettings().autoArchiveDoneAfterDays,
      now: () => new Date().toISOString(),
      isCancelled: () => this.housekeepingCancelled,
      runThreadMutation: (threadId, operation) =>
        this.options.supervisor.runThreadMutation(threadId, operation),
      // `closeThreadConfirmed` is a thread-control procedure: it cancels queued
      // mutations and never wraps itself in the outer mutation lock, so calling
      // it from inside the housekeeping lock cannot deadlock. H2: the call is
      // never allowed to start a supervisor, and a no-start refusal counts as
      // confirmed retirement only when the lifecycle owner positively proves no
      // process or transition can still act.
      closeThreadConfirmed: async (threadId) => {
        try {
          const result = await this.options.supervisor.call(
            "closeThreadConfirmed",
            { threadId },
            { startIfNeeded: false },
          );
          return result.confirmed;
        } catch (error) {
          if (
            error instanceof SupervisorUnavailableError &&
            this.options.supervisor.isSupervisorProvenAbsent()
          ) {
            return true;
          }
          throw error;
        }
      },
      deleteThread: dbDeleteThread,
      publishThreadsChanged: (threadIds) => this.options.publishThreadsChanged?.(threadIds),
      ...(this.options.reportError ? { reportError: this.options.reportError } : {}),
    });
    this.housekeepingRun = run.then(
      () => undefined,
      (error: unknown) => {
        this.options.reportError?.(error);
      },
    );
  }

  observeSupervisorEvent(event: SupervisorEvent): boolean {
    if (this.disposed) return true;
    if (observeRoutingSettingsEvent(this.options, event)) return true;
    this.appControls.observeSupervisorEvent(event);
    this.scheduleCoordinator.observeSupervisorEvent(event);
    this.prWatchService.observeSupervisorEvent(event);
    this.gitStateService.observeSupervisorEvent(event);
    return false;
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    // H4: cancel the sweep synchronously, before any join starts, and join its
    // in-flight operation in the same shutdown barrier. The composition stops
    // the supervisor concurrently, so a held retirement call settles promptly
    // instead of stalling the close.
    this.housekeepingCancelled = true;
    const barrier = Promise.withResolvers<void>();
    this.disposal = barrier.promise;
    // Every stop runs synchronously before joining, even if another stop throws.
    // The composition stops the supervisor concurrently while keeping SQLite open.
    void joinRuntimeShutdown(
      [
        () => this.housekeepingRun?.then(() => undefined),
        () => {
          // Unsubscribe first so a late commit can no longer enqueue work.
          this.unsubscribeThreadsDeleted?.();
          this.unsubscribeThreadsDeleted = null;
          return this.attachmentReclaim?.dispose() ?? Promise.resolve();
        },
        () => this.scheduleService.dispose(),
        () => this.scheduleCoordinator.dispose(),
        () => this.prWatchService.dispose(),
        () => this.gitStateService.dispose(),
        () => this.appControls.dispose(),
      ],
      "Backend durable services did not shut down cleanly.",
    ).then(barrier.resolve, barrier.reject);
    return this.disposal;
  }
}
