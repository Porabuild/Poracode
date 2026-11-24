import { homedir } from "node:os";
import {
  assertRemoteGitMutationExperimentSafe,
  readPersistedExperiments,
} from "@/host/remote/experimentOwnership";
import { msg } from "@/shared/messages";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";
import { DeviceWorkspaceService } from "@/host/devices/DeviceWorkspaceService";
import { DeviceHubRuntime } from "@/host/devices/DeviceHubRuntime";
import {
  dbAdmitScheduleExecution,
  dbDeleteThread,
  dbGetProject,
  dbGetProjectNotes,
  dbCompareAndSetProjectNotes,
  dbGetProjects,
  dbGetThread,
  dbGetThreadRuntimeItemCursor,
  dbGetThreadRuntimeItemsAfter,
  dbPatchScheduleRuntime,
  dbGetThreads,
  dbInsertScheduleRun,
  dbSetThreadsDone,
  dbInterruptScheduleRuns,
  dbListThreadIds,
  dbBeginWorktreeObservation,
  dbReconcileProjectWorktrees,
  dbUpdateScheduleRun,
  dbGetScheduleRun,
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
import type { SupervisorCall } from "@/host/app-controls/supervisorCaller";
import { ProjectActionService } from "@/host/app-controls/projectActions";
import {
  createGitStateExecutor,
  GitStateService,
  HostGitSummariesController,
  ProjectWatchLeases,
} from "@/host/gitState";
import { ForgeActivityService } from "@/host/forgeActivity";
import {
  buildPrWatchExecutionDeps,
  createDevicePrWatchService,
  PrMergeLifecycleService,
  type PrWatchService,
} from "@/host/prWatch";
import {
  createDeviceScheduleService,
  ScheduleRunCoordinator,
  type ScheduleService,
} from "@/host/schedules";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import { SupervisorUnavailableError } from "@/host/supervisor/SupervisorClient";
import type {
  PrData,
  PrDetails,
  PrWatch,
  ProjectLocation,
  RemoteThreadCommand,
} from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import { gitProjectKey, type GitStatePatch } from "@/shared/gitState";
import { repoIdentityKey } from "@/shared/repoIdentity";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RemoteGitSummaries } from "@/shared/remote";
import type { RemoteForgeActivityEvent } from "@/shared/remote/protocol/forgeActivity";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult, SettingsOwnerEdit } from "@/shared/settingsTransactions";
import { observeRoutingSettingsEvent } from "./BackendRoutingSettings";
import { observeSupervisorSettingsEditsEvent } from "./BackendSupervisorSettingsEdits";
import { runThreadHousekeeping } from "./ThreadHousekeepingService";
import {
  installMemoryDeleteHook,
  runMemoryCapturePass,
  runScheduledMemoryDream,
  setMemoryModelCaller,
} from "@/host/memory/runtime";
import { setMemoryRepoKeyReader } from "@/host/memory/repoKeyReader";
import { setMemorySettingsReader } from "@/host/memory/settingsReader";
import { defaultMemorySettings, memoryDreamIntervalMs } from "@/shared/memory";
import {
  collectMemoryModelCandidates,
  isEligibleMemoryOneShotAgent,
  pickMemoryModel,
  type MemoryModelCandidate,
} from "@/shared/memoryModelChoice";
import {
  dbCountPendingCandidates,
  dbMemoryMeta,
  dbStartMemoryCapture,
} from "@/host/db/memoryStore";

export interface BackendDurableServicesOptions {
  appVersion: string;
  reopenThread?: NonNullable<AppControlsMcpIngressDeps["reopenThread"]>;
  revertCheckpoint?: NonNullable<AppControlsMcpIngressDeps["revertCheckpoint"]>;
  beginQueueActivity?(threadId: string): (() => void) | undefined;
  applyThreadLifecycle?: NonNullable<AppControlsMcpIngressDeps["applyThreadLifecycle"]>;
  importSession?: NonNullable<AppControlsMcpIngressDeps["importSession"]>;
  editCatalog?: NonNullable<AppControlsMcpIngressDeps["editCatalog"]>;
  experiments?: NonNullable<AppControlsMcpIngressDeps["experiments"]>;
  moveThreadToWorktree?: NonNullable<AppControlsMcpIngressDeps["moveThreadToWorktree"]>;
  handoffThread?: NonNullable<AppControlsMcpIngressDeps["handoffThread"]>;
  transferThread?: NonNullable<AppControlsMcpIngressDeps["transferThread"]>;
  syncMemory?: NonNullable<AppControlsMcpIngressDeps["syncMemory"]>;
  localPorts?: NonNullable<AppControlsMcpIngressDeps["localPorts"]>;
  openProviderLogin?: NonNullable<AppControlsMcpIngressDeps["openProviderLogin"]>;
  hostId: string;
  supervisor: SupervisorClient;
  getSharedSettings(): SharedSettings;
  /** Trusted single-field CAS edit for owner-managed records (learned routing
   * usage, overrides). Backed by the composition's settings authority. */
  editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult>;
  editSettingsFields?: NonNullable<AppControlsMcpIngressDeps["settings"]["editFields"]>;
  editPreferences(
    compute: (current: SharedSettings) => SharedSettings,
  ): Promise<SettingsMutationResult>;
  /** Supervisor-owned records (ACP registry installs, hook verdicts) committed
   * through the composition's settings authority; the supervisor never writes
   * settings.json itself. */
  commitOwnerSettingsEdits(edits: readonly SettingsOwnerEdit[]): Promise<void>;
  assertCanPersistSecrets(): void;
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
  deviceHubRoot?: string;
  hasRendererWindow: boolean | (() => boolean);
  openThreadInUi(threadId: string): boolean;
  notifyUser: AppControlsMcpIngressDeps["notifyUser"];
  checkForUpdate: AppControlsMcpIngressDeps["checkForUpdate"];
  onPrMerged?(watch: PrWatch): void;
  onPrObserved?(watch: PrWatch, pr: PrData, details?: PrDetails): void;
  onGitPatch(patch: GitStatePatch): void;
  onGitSummariesChanged?(summaries: RemoteGitSummaries): void;
  /** Out-of-band trigger for clients to re-read forge state after an agent changed it. */
  onForgeActivity?(event: RemoteForgeActivityEvent): void;
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
  readonly prMergeLifecycle: PrMergeLifecycleService;
  readonly gitStateService: GitStateService;
  readonly gitSummaries: HostGitSummariesController;
  readonly forgeActivityService: ForgeActivityService;
  /** Per-owner leases on the supervisor's shared project watcher. Lives with
   * the durable host so remote-server replacement and supervisor resets keep
   * every client's watch interest. */
  readonly projectWatchLeases: ProjectWatchLeases;
  readonly appControls: AppControlsMcpIngress;
  private readonly projectActions: ProjectActionService;
  readonly deviceWorkspace: DeviceWorkspaceService;
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
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private memoryPass: Promise<void> | null = null;
  private memoryWasEnabled: boolean;
  private scheduledDreamBackoffUntilMs = 0;

  constructor(private readonly options: BackendDurableServicesOptions) {
    const memory = options.getSharedSettings()?.memory;
    this.memoryWasEnabled = Boolean(memory?.enabled && memory.learning);
    this.deviceWorkspace = new DeviceWorkspaceService(
      (id) => {
        const thread = dbGetThread(id);
        return thread !== null && !thread.archived;
      },
      undefined,
      Date.now,
      options.deviceHubRoot ? new DeviceHubRuntime(options.deviceHubRoot) : null,
    );
    const { supervisor } = options;
    this.scheduleCoordinator = new ScheduleRunCoordinator({
      admitScheduleExecution: dbAdmitScheduleExecution,
      startThread: (payload) => supervisor.call("startThread", payload),
      sendThreadInput: (payload) => supervisor.call("sendThreadInput", payload),
      interruptThread: (threadId) => supervisor.call("interruptThread", { threadId }),
      evaluateCompletion: (payload) => supervisor.call("evaluateScheduleCompletion", payload),
      cancelCompletionEvaluation: (id) =>
        supervisor.call("cancelScheduleCompletionEvaluation", { id }),
      getThread: dbGetThread,
      getThreadRuntimeItemCursor: dbGetThreadRuntimeItemCursor,
      getThreadRuntimeItemsAfter: dbGetThreadRuntimeItemsAfter,
      onRunStatus: (scheduleId, lastStatus, lastError) =>
        dbPatchScheduleRuntime(scheduleId, {
          lastStatus,
          lastError,
          updatedAt: new Date().toISOString(),
        }),
      ...(options.reportError ? { onError: options.reportError } : {}),
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
      runTask: (task, context) => this.scheduleCoordinator.runScheduleAsThread(task, context),
      cancelRun: (id) => this.scheduleCoordinator.cancelRun(id),
      recordSkipped: (task, context) => {
        this.scheduleCoordinator.recordSkippedRun(task, context);
      },
      onRetryingRun: (id) => {
        const result = dbGetScheduleRun(id)?.result;
        if (result)
          dbUpdateScheduleRun(id, {
            result: { ...result, unread: false, archivedAt: null, stopReason: "retry-pending" },
          });
      },
      onRetryWaitFinished: (id, continuing) => {
        const result = dbGetScheduleRun(id)?.result;
        if (result)
          dbUpdateScheduleRun(id, {
            result: {
              ...result,
              unread: !continuing,
              archivedAt: continuing ? new Date().toISOString() : null,
              stopReason: continuing ? "retry-attempt" : "retry-cancelled",
            },
          });
      },
      ...(options.reportError
        ? { onError: (_scheduleId: string, error: unknown) => options.reportError?.(error) }
        : {}),
      onStartupInterrupted: (scheduleId) =>
        dbInterruptScheduleRuns(scheduleId, new Date().toISOString()),
    });

    const sharedAppControlsDeps = buildSharedAppControlsIngressDeps({
      call: (name, payload) => supervisor.call(name, payload),
      sendThreadCommand: options.sendThreadCommand,
      getSharedSettings: options.getSharedSettings,
      publishProjectsChanged: options.publishProjectsChanged,
      ...(options.applyThreadLifecycle
        ? {
            prepareWorktree: (projectId: string, worktreePath: string, threadId: string) =>
              options.applyThreadLifecycle!({
                kind: "prepare-worktree",
                threadId,
                projectId,
                worktreePath,
              }),
          }
        : {}),
      ...(options.publishThreadsChanged
        ? { publishThreadsChanged: options.publishThreadsChanged }
        : {}),
    });
    this.gitStateService = new GitStateService({
      hostId: options.hostId,
      executor: createGitStateExecutor((name, payload) => supervisor.call(name, payload)),
      getProject: dbGetProject,
      getProjects: dbGetProjects,
      onPatch: (patch) => {
        this.gitSummaries.notifyChanged();
        this.prMergeLifecycle.handleGitPatch(patch);
        options.onGitPatch(patch);
      },
      beginWorktreeObservation: (projectId) => {
        const observation = dbBeginWorktreeObservation(projectId);
        return (worktrees) => {
          const changedIds = dbReconcileProjectWorktrees(projectId, worktrees, observation);
          if (changedIds === null) return false;
          if (changedIds.length > 0) options.publishThreadsChanged?.(changedIds);
          return true;
        };
      },
    });
    this.gitSummaries = new HostGitSummariesController({
      hostId: options.hostId,
      getSnapshot: () => this.gitStateService.getSnapshot(),
      getThreads: dbGetThreads,
      onPublish: (summaries) => {
        options.onGitSummariesChanged?.(summaries);
      },
    });
    this.prMergeLifecycle = new PrMergeLifecycleService({
      hostId: options.hostId,
      getProject: dbGetProject,
      getThread: dbGetThread,
      getThreads: dbGetThreads,
      getGitSnapshot: () => this.gitStateService.getSnapshot(),
      getSharedSettings: options.getSharedSettings,
      getGitStatus: (payload) => supervisor.call("getGitStatus", payload),
      gitPull: (payload) => supervisor.call("gitPull", payload),
      refreshProjectAfterSync: (projectId) =>
        this.gitStateService.refreshProject(projectId, { afterMutation: true }),
      isExperimentThread: (threadId) =>
        readPersistedExperiments().some((experiment) =>
          experiment.candidates.some((candidate) => candidate.threadId === threadId),
        ),
      closeThreadConfirmed: (threadId) => this.closeThreadConfirmed(threadId),
      markThreadDoneInDb: (threadId, doneAt) => dbSetThreadsDone([threadId], doneAt) > 0,
      publishThreadsChanged: (threadIds) => {
        options.publishThreadsChanged?.(threadIds);
        this.gitSummaries.notifyChanged();
      },
      sendThreadCommand: options.sendThreadCommand,
      ...(options.reportError ? { reportError: options.reportError } : {}),
    });
    this.forgeActivityService = new ForgeActivityService({
      getThread: dbGetThread,
      gitState: this.gitStateService,
      publish: (event) => options.onForgeActivity?.(event),
      ...(options.reportError ? { reportError: options.reportError } : {}),
    });
    this.projectWatchLeases = new ProjectWatchLeases({
      call: (name, payload, callOptions) => supervisor.call(name, payload, callOptions),
      getProject: dbGetProject,
    });
    this.prWatchService = createDevicePrWatchService({
      getProject: dbGetProject,
      getPrForBranch: (project, branch, scope) =>
        scope
          ? supervisor.call("forgeGetPrForBranch", {
              projectLocation: project.location,
              branch,
              forgeAccount: scope.account,
              forgeRepository: scope.repository,
            })
          : supervisor.call("ghGetPrForBranch", { projectLocation: project.location, branch }),
      getPrDetails: (project, prNumber, account, repository) =>
        account
          ? supervisor.call("forgeGetPrDetails", {
              projectLocation: project.location,
              prNumber,
              forgeAccount: account,
              ...(repository ? { forgeRepository: repository } : {}),
            })
          : supervisor.call("ghGetPrDetails", { projectLocation: project.location, prNumber }),
      getPrReviewThreads: (project, prNumber, account, repository) =>
        (account
          ? supervisor.call("forgeGetPrReviewComments", {
              projectLocation: project.location,
              prNumber,
              forgeAccount: account,
              ...(repository ? { forgeRepository: repository } : {}),
            })
          : supervisor.call("ghGetPrReviewComments", {
              projectLocation: project.location,
              prNumber,
            })
        ).then((result) => result.threads),
      getMergeMethod: () => options.getSharedSettings().prMergeMethod,
      mergePr: async (project, prNumber, method, reviewedPr) => {
        const payload = { projectLocation: project.location, prNumber, method, admin: false };
        const source = reviewedPr.source;
        const account = source
          ? {
              forgeRepository: source.repository,
              ...(source.account ? { forgeAccount: source.account } : {}),
            }
          : {};
        if (source) {
          if (
            !reviewedPr.headSha ||
            !source.capabilities.expectedHeadMerge ||
            !source.capabilities.autoMerge
          )
            throw new Error(msg("forge.autoMergeUnavailable"));
          await supervisor.call("forgeMergePrAtHead", {
            ...payload,
            ...account,
            expectedHeadSha: reviewedPr.headSha,
          });
        } else if (reviewedPr.headSha)
          await supervisor.call("ghMergePrAtHead", {
            ...payload,
            expectedHeadSha: reviewedPr.headSha,
          });
        else await supervisor.call("ghMergePr", payload);
        try {
          const result = source
            ? await supervisor.call("forgeGetPrDetails", {
                projectLocation: project.location,
                prNumber,
                ...account,
              })
            : await supervisor.call("ghGetPrDetails", {
                projectLocation: project.location,
                prNumber,
              });
          return result.pr;
        } catch (error) {
          options.reportError?.(error);
          return undefined;
        }
      },
      onPrMerged: (watch) => {
        this.prMergeLifecycle.handlePrMerged(watch);
        options.onPrMerged?.(watch);
      },
      onPrObserved: (watch, pr, details) => {
        this.prMergeLifecycle.handlePrObserved(watch, pr);
        options.onPrObserved?.(watch, pr, details);
        this.gitStateService.applyObservedPullRequest(watch, pr, details);
      },
      createThread: sharedAppControlsDeps.createThread,
      retireObsoleteLaunchThread: (_watch, threadId) => this.closeThreadConfirmed(threadId),
      ...(options.reportError ? { reportError: options.reportError } : {}),
      isThreadActive: (threadId) => {
        const status = dbGetThread(threadId)?.status;
        return status !== undefined && isThreadTurnActive(status);
      },
      ...buildPrWatchExecutionDeps({
        call: (name, payload) => supervisor.call(name, payload),
        getSharedSettings: options.getSharedSettings,
      }),
    });
    const callAppControlsSupervisor: SupervisorCall = (name, payload) => {
      assertRemoteGitMutationExperimentSafe(name, payload);
      return supervisor.call(name, payload);
    };
    this.projectActions = new ProjectActionService(callAppControlsSupervisor, dbGetProject);
    this.appControls = new AppControlsMcpIngress({
      projectActions: this.projectActions,
      gitState: this.gitStateService,
      scheduleService: this.scheduleService,
      prWatches: this.prWatchService,
      getThread: dbGetThread,
      getThreads: dbGetThreads,
      getProjects: dbGetProjects,
      getProject: dbGetProject,
      getProjectNotes: dbGetProjectNotes,
      compareAndSetProjectNotes: dbCompareAndSetProjectNotes,
      resolvePooledIdentity: async (metadata, serverId) => {
        const resolved = await supervisor.call("resolveMcpSessionIdentity", {
          metadata,
          serverId,
        });
        if (!resolved) return null;
        const thread = dbGetThread(resolved.threadId);
        return {
          ...resolved,
          ...(thread?.title ? { title: thread.title } : {}),
          deviceProof: this.deviceWorkspace.issueThreadProof(resolved.threadId),
        };
      },
      ...(options.reopenThread ? { reopenThread: options.reopenThread } : {}),
      ...(options.importSession ? { importSession: options.importSession } : {}),
      ...(options.editCatalog ? { editCatalog: options.editCatalog } : {}),
      ...(options.experiments ? { experiments: options.experiments } : {}),
      ...(options.handoffThread ? { handoffThread: options.handoffThread } : {}),
      ...(options.transferThread ? { transferThread: options.transferThread } : {}),
      ...(options.syncMemory ? { syncMemory: options.syncMemory } : {}),
      ...(options.localPorts ? { localPorts: options.localPorts } : {}),
      ...(options.openProviderLogin ? { openProviderLogin: options.openProviderLogin } : {}),
      ...(options.moveThreadToWorktree
        ? { moveThreadToWorktree: options.moveThreadToWorktree }
        : {}),
      ...(options.revertCheckpoint ? { revertCheckpoint: options.revertCheckpoint } : {}),
      runtime: {
        call: async (name, payload) => {
          const finishActivity =
            name === "queueThreadFollowUp" &&
            "threadId" in payload &&
            typeof payload.threadId === "string"
              ? options.beginQueueActivity?.(payload.threadId)
              : undefined;
          const result = await callAppControlsSupervisor(name, payload);
          if (finishActivity) {
            try {
              finishActivity();
            } catch (error) {
              options.reportError?.(error);
            }
          }
          return result;
        },
      },
      ...sharedAppControlsDeps,
      ...(options.reportError ? { reportError: options.reportError } : {}),
      settings: {
        read: options.getSharedSettings,
        editField: options.editSettingsField,
        ...(options.editSettingsFields ? { editFields: options.editSettingsFields } : {}),
        editPreferences: options.editPreferences,
      },
      assertCanPersistSecrets: options.assertCanPersistSecrets,
      getAppInfo: () => ({
        version: options.appVersion,
        platform: process.platform,
        hasRendererWindow:
          typeof options.hasRendererWindow === "function"
            ? options.hasRendererWindow()
            : options.hasRendererWindow,
      }),
      supervisor: createAppControlsSupervisorCaller(callAppControlsSupervisor),
      emitRemoteThreadCommand: options.emitRemoteThreadCommand ?? options.sendThreadCommand,
      openThreadInUi: options.openThreadInUi,
      notifyUser: options.notifyUser,
      checkForUpdate: options.checkForUpdate,
      deviceWorkspace: this.deviceWorkspace,
      ...(options.applyThreadLifecycle
        ? { applyThreadLifecycle: options.applyThreadLifecycle }
        : {}),
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
    setMemorySettingsReader(
      () => this.options.getSharedSettings()?.memory ?? defaultMemorySettings,
    );
    setMemoryRepoKeyReader((projectId) =>
      repoIdentityKey(
        this.gitStateService.getSnapshot().projects[
          gitProjectKey({ hostId: this.options.hostId, projectId })
        ]?.status?.remoteInfo,
      ),
    );
    installMemoryDeleteHook();
    setMemoryModelCaller({
      complete: (input) => this.completeMemoryPrompt(input),
    });
  }

  private async completeMemoryPrompt(input: {
    projectId: string | null;
    purpose: "capture" | "dream";
    prompt: string;
  }): Promise<string> {
    if (this.disposed) throw new Error("Backend durable services are shutting down.");
    const shared = this.options.getSharedSettings();
    const settings = shared?.memory ?? defaultMemorySettings;
    const provider = input.purpose === "dream" ? settings.dreamProvider : settings.captureProvider;
    const model = input.purpose === "dream" ? settings.dreamModel : settings.captureModel;
    const effort = input.purpose === "dream" ? settings.dreamEffort : settings.captureEffort;
    const fast = input.purpose === "dream" ? settings.dreamFast : settings.captureFast;
    const allProjects = dbGetProjects();
    const project = (input.projectId ? dbGetProject(input.projectId) : null) ?? allProjects[0];
    if (!project) throw new Error("No project is available for a memory model call.");
    const wslDistro = project.location.kind === "wsl" ? project.location.distro : undefined;
    const statuses = await this.options.supervisor.call("getAgentStatuses", {
      wslDistros: wslDistro ? [wslDistro] : [],
    });
    if (this.disposed) throw new Error("Backend durable services are shutting down.");
    const disabled = new Set(shared?.disabledAgents ?? []);
    const hiddenModels = shared?.hiddenModels ?? {};
    const role = input.purpose === "dream" ? "dream" : "capture";
    const buildAttempts = (pool: typeof statuses.windows): MemoryModelCandidate[] => {
      const agents = pool.filter((agent) => isEligibleMemoryOneShotAgent(agent, disabled));
      const candidates = collectMemoryModelCandidates(agents, {
        hiddenModelsByAgent: hiddenModels,
        explicitProvider: provider,
        explicitModel: model,
      });
      const built: MemoryModelCandidate[] = [];
      if (provider !== "auto") {
        const scoped = candidates.filter((candidate) => candidate.agentKind === provider);
        const explicit =
          model && scoped.some((candidate) => candidate.model === model)
            ? scoped.find((candidate) => candidate.model === model)
            : undefined;
        const chosen = explicit ?? pickMemoryModel(scoped, role);
        if (chosen) built.push(chosen);
        return built;
      }
      const remaining = [...candidates];
      const triedProviders = new Set<string>();
      while (remaining.length > 0) {
        const next = pickMemoryModel(remaining, role);
        if (!next) break;
        built.push(next);
        triedProviders.add(next.agentKind);
        for (let i = remaining.length - 1; i >= 0; i -= 1) {
          if (triedProviders.has(remaining[i]!.agentKind)) remaining.splice(i, 1);
        }
      }
      return built;
    };

    const primaryPool = wslDistro
      ? statuses.wsl.filter((agent) => agent.envDistro === wslDistro)
      : statuses.windows;
    let executionLocation: ProjectLocation = project.location;
    let attempts = buildAttempts(primaryPool);
    if (attempts.length === 0 && wslDistro) {
      const hostAttempts = buildAttempts(statuses.windows);
      if (hostAttempts.length > 0) {
        attempts = hostAttempts;
        const hostProject = allProjects.find((item) => item.location.kind !== "wsl");
        executionLocation = hostProject?.location ?? {
          kind: process.platform === "win32" ? "windows" : "posix",
          path: homedir(),
        };
      }
    } else if (attempts.length === 0 && !wslDistro) {
      const allWslDistros = [
        ...new Set(
          allProjects
            .map((item) => (item.location.kind === "wsl" ? item.location.distro : undefined))
            .filter((distro): distro is string => Boolean(distro)),
        ),
      ];
      if (allWslDistros.length > 0) {
        const wslStatuses = await this.options.supervisor.call("getAgentStatuses", {
          wslDistros: allWslDistros,
        });
        if (this.disposed) throw new Error("Backend durable services are shutting down.");
        for (const item of allProjects) {
          if (item.location.kind !== "wsl") continue;
          const distro = item.location.distro;
          const wslAttempts = buildAttempts(
            wslStatuses.wsl.filter((agent) => agent.envDistro === distro),
          );
          if (wslAttempts.length > 0) {
            attempts = wslAttempts;
            executionLocation = item.location;
            break;
          }
        }
      }
    }
    if (attempts.length === 0) throw new Error("No one-shot agent is available for memory.");
    let lastError: unknown;
    for (const chosen of attempts) {
      if (this.disposed) throw new Error("Backend durable services are shutting down.");
      const startedAt = Date.now();
      try {
        const result = await this.options.supervisor.call("generateMemoryText", {
          projectLocation: executionLocation,
          agentKind: chosen.agentKind,
          prompt: input.prompt,
          selection: {
            model: chosen.model,
            ...(effort ? { effort } : {}),
            ...(fast ? { fast } : {}),
          },
        });
        console.info(
          `[memory] ${input.purpose} completed via ${chosen.agentKind}/${chosen.model} in ${Date.now() - startedAt}ms`,
        );
        return result.text;
      } catch (error) {
        lastError = error;
        console.warn(
          `[memory] ${input.purpose} failed via ${chosen.agentKind}/${chosen.model} after ${Date.now() - startedAt}ms:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  observeMemorySettings(settings: SharedSettings | undefined): void {
    const enabled = Boolean(settings?.memory?.enabled && settings.memory.learning);
    if (enabled && (!this.memoryWasEnabled || !dbMemoryMeta("captureCutoffAt"))) {
      dbStartMemoryCapture(new Date().toISOString());
    }
    this.memoryWasEnabled = enabled;
  }

  private startMemory(): void {
    const tick = () => {
      if (this.disposed || this.memoryPass) return;
      this.memoryPass = (async () => {
        this.observeMemorySettings(this.options.getSharedSettings() ?? undefined);
        if (!this.memoryWasEnabled) return;
        const result = await runMemoryCapturePass();
        if (this.disposed) return;
        if (result.captured > 0 || result.spooled > 0) {
          console.info(`[memory] pass captured=${result.captured} spooled=${result.spooled}`);
        }
        await this.maybeDream();
      })()
        .catch((error: unknown) => {
          if (!this.disposed) this.options.reportError?.(error);
        })
        .finally(() => {
          this.memoryPass = null;
        });
    };
    this.memoryTimer = setInterval(tick, 20_000);
    this.memoryTimer.unref?.();
  }

  private async maybeDream(): Promise<void> {
    if (this.disposed) return;
    if (Date.now() < this.scheduledDreamBackoffUntilMs) return;
    const settings = this.options.getSharedSettings()?.memory ?? defaultMemorySettings;
    const interval = memoryDreamIntervalMs(settings);
    if (!settings.enabled || !settings.learning || !interval || dbCountPendingCandidates() === 0)
      return;
    const last = dbMemoryMeta("lastDreamAt");
    if (last && Date.now() - Date.parse(last) < interval) return;
    try {
      await runScheduledMemoryDream();
      this.scheduledDreamBackoffUntilMs = 0;
    } catch (error) {
      this.scheduledDreamBackoffUntilMs = Date.now() + 15 * 60_000;
      console.warn(
        "[memory] scheduled dream failed; retrying in 15m:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  getSupervisorExtraEnv(): Record<string, string> {
    if (this.disposed) return {};
    const info = this.appControls.getInfo();
    return info
      ? {
          PORACODE_APP_CONTROLS_MCP_URL: info.url,
          PORACODE_APP_CONTROLS_MCP_TOKEN: info.token,
          ...this.deviceWorkspace.supervisorExtraEnv(),
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
    this.ingressStart ??= Promise.all([
      this.appControls.start(),
      this.deviceWorkspace.preparePreview(),
    ]).then(
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
    this.startMemory();
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
      closeThreadConfirmed: (threadId) => this.closeThreadConfirmed(threadId),
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

  handleSupervisorReset(): void {
    this.projectActions.reset();
    this.scheduleCoordinator.handleSupervisorReset();
    this.projectWatchLeases.handleSupervisorReset();
  }

  /**
   * `SupervisorClientOptions.onStarted`: clients never re-send the watches they
   * registered, so the replacement supervisor gets them from the leases. The
   * callback runs inside the launch; an explicit restart is still settling
   * then, and the re-apply refuses to dispatch (or fork) during a transition.
   */
  handleSupervisorStarted(): void {
    if (this.disposed) return;
    setImmediate(() => {
      if (this.disposed) return;
      this.projectWatchLeases.reapplyAfterSupervisorStart().catch((error: unknown) => {
        this.options.reportError?.(error);
      });
    });
  }

  observeSupervisorEvent(event: SupervisorEvent): boolean {
    this.projectActions.observe(event);
    if (this.disposed) return true;
    if (observeRoutingSettingsEvent(this.options, event)) return true;
    if (observeSupervisorSettingsEditsEvent(this.options, event)) return true;
    this.appControls.observeSupervisorEvent(event);
    this.scheduleCoordinator.observeSupervisorEvent(event);
    this.prWatchService.observeSupervisorEvent(event);
    this.prMergeLifecycle.observeSupervisorEvent(event);
    this.forgeActivityService.observeSupervisorEvent(event);
    this.gitStateService.observeSupervisorEvent(event);
    return false;
  }

  /** Confirm retirement without starting a new supervisor or releasing row custody. */
  private async closeThreadConfirmed(threadId: string): Promise<boolean> {
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
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    // H4: cancel the sweep synchronously, before any join starts, and join its
    // in-flight operation in the same shutdown barrier. The composition stops
    // the supervisor concurrently while keeping SQLite open.
    this.housekeepingCancelled = true;
    const barrier = Promise.withResolvers<void>();
    this.disposal = barrier.promise;
    // Every stop runs synchronously before joining, even if another stop throws.
    // The composition stops the supervisor concurrently while keeping SQLite open.
    void joinRuntimeShutdown(
      [
        () => this.memoryPass ?? Promise.resolve(),
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
        () => this.prMergeLifecycle.dispose(),
        () => Promise.resolve(this.forgeActivityService.dispose()),
        () => {
          this.gitSummaries.dispose();
          return this.gitStateService.dispose();
        },
        () => this.projectWatchLeases.dispose(),
        () => {
          this.projectActions.reset();
          return this.appControls.dispose();
        },
        () => this.deviceWorkspace.dispose(),
      ],
      "Backend durable services did not shut down cleanly.",
    ).then(barrier.resolve, (error: unknown) => {
      // A refused retirement retains its owned thread. A later explicit close
      // must be able to retry that custody barrier once the supervisor settles.
      this.disposal = null;
      barrier.reject(error);
    });
    return barrier.promise;
  }
}
