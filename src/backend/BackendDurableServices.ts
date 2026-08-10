import { existsSync } from "node:fs";
import {
  dbDeleteThread,
  dbGetProject,
  dbGetProjectNotes,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbInsertScheduleRun,
  dbInterruptScheduleRuns,
  dbUpdateScheduleRun,
  dbUpsertThread,
} from "@/main/db";
import {
  AppControlsMcpIngress,
  buildSharedAppControlsIngressDeps,
  createAppControlsSupervisorCaller,
} from "@/main/app-controls";
import type { AppControlsMcpIngressDeps } from "@/main/app-controls/AppControlsMcpIngress";
import { createGitStateExecutor, GitStateService } from "@/main/gitState";
import { createDevicePrWatchService, type PrWatchService } from "@/main/prWatch";
import {
  createDeviceScheduleService,
  ensureHomeProjectRow,
  ScheduleRunCoordinator,
  type ScheduleService,
} from "@/main/schedules";
import type { SupervisorClient } from "@/main/supervisor/SupervisorClient";
import type { PrData, PrDetails, PrWatch, RemoteThreadCommand } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import type { GitStatePatch } from "@/shared/gitState";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SharedSettings } from "@/shared/settings";

export interface BackendDurableServicesOptions {
  appVersion: string;
  hostId: string;
  supervisor: SupervisorClient;
  getSharedSettings(): SharedSettings;
  writeSharedSettings(settings: SharedSettings): void;
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  publishProjectsChanged(): void;
  hasRendererWindow: boolean;
  openThreadInUi(threadId: string): boolean;
  notifyUser: AppControlsMcpIngressDeps["notifyUser"];
  checkForUpdate: AppControlsMcpIngressDeps["checkForUpdate"];
  onPrMerged?(watch: PrWatch): void;
  onPrObserved?(watch: PrWatch, pr: PrData, details?: PrDetails): void;
  onGitPatch(patch: GitStatePatch): void;
}

/** Shared durable service graph used by both desktop BackendHost and headless server. */
export class BackendDurableServices {
  readonly scheduleCoordinator: ScheduleRunCoordinator;
  readonly scheduleService: ScheduleService;
  readonly prWatchService: PrWatchService;
  readonly gitStateService: GitStateService;
  readonly appControls: AppControlsMcpIngress;
  private ingressStarted = false;
  private backgroundStarted = false;

  constructor(private readonly options: BackendDurableServicesOptions) {
    const { supervisor } = options;
    this.scheduleCoordinator = new ScheduleRunCoordinator({
      startThread: (payload) => supervisor.call("startThread", payload),
      getAgentStatuses: (wslDistros) => supervisor.call("getAgentStatuses", { wslDistros }),
      sendThreadCommand: options.sendThreadCommand,
      ensureHomeProject: ensureHomeProjectRow,
      getProject: dbGetProject,
      getSharedSettings: options.getSharedSettings,
      upsertThread: dbUpsertThread,
      deleteThread: dbDeleteThread,
      threadExists: (threadId) => dbGetThread(threadId) != null,
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
      worktreeExists: existsSync,
    });
    this.appControls = new AppControlsMcpIngress({
      scheduleService: this.scheduleService,
      getThread: dbGetThread,
      getThreads: dbGetThreads,
      getProjects: dbGetProjects,
      getProject: dbGetProject,
      getProjectNotes: dbGetProjectNotes,
      ...sharedAppControlsDeps,
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
      emitRemoteThreadCommand: options.sendThreadCommand,
      openThreadInUi: options.openThreadInUi,
      notifyUser: options.notifyUser,
      checkForUpdate: options.checkForUpdate,
    });
  }

  getSupervisorExtraEnv(): Record<string, string> {
    const info = this.appControls.getInfo();
    return info
      ? {
          PORACODE_APP_CONTROLS_MCP_URL: info.url,
          PORACODE_APP_CONTROLS_MCP_TOKEN: info.token,
        }
      : {};
  }

  async startIngress(): Promise<void> {
    if (this.ingressStarted) return;
    this.ingressStarted = true;
    await this.appControls.start();
  }

  startBackgroundServices(): void {
    if (this.backgroundStarted) return;
    this.backgroundStarted = true;
    this.scheduleService.start();
    this.prWatchService.start();
    this.gitStateService.start();
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    this.appControls.observeSupervisorEvent(event);
    this.scheduleCoordinator.observeSupervisorEvent(event);
    this.prWatchService.observeSupervisorEvent(event);
    this.gitStateService.observeSupervisorEvent(event);
  }

  dispose(): void {
    this.scheduleService.dispose();
    this.prWatchService.dispose();
    this.gitStateService.dispose();
    this.appControls.dispose();
  }
}
