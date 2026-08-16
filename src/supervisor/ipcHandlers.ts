import { defineSupervisorIpcHandlers, type SupervisorIpcHandlerMap } from "@/shared/ipc";
import type { SupervisorRuntime } from "./supervisorRuntime";

/**
 * Maps IPC procedures straight onto the runtime's services. Payload → argument
 * unpacking lives here; `SupervisorRuntime` itself only hosts service wiring
 * and the few cross-service orchestrations (worktree removal/prune, project
 * relocation, sync, snapshots, clone) that the map calls through `runtime`.
 */
export function createSupervisorIpcHandlers(runtime: SupervisorRuntime): SupervisorIpcHandlerMap {
  const registry = runtime.agentRegistryService;
  const usage = runtime.usageService;
  const hookPlugins = runtime.cliHookPluginCoordinator;
  const threads = runtime.threadSessionManager;
  const git = runtime.gitService;
  const checkpoints = runtime.gitCheckpointService;
  const github = runtime.githubService;
  const generation = runtime.generationService;
  const fileIndex = runtime.fileIndexService;
  const projectTree = runtime.projectTreeService;
  const lsp = runtime.lspManager;
  const mcpProbe = runtime.mcpProbeService;
  const mcpOAuth = runtime.mcpOAuthService;
  const externalMcpDiscovery = runtime.externalMcpDiscoveryService;
  const skills = runtime.skillsService;
  const pluginRegistry = runtime.pluginRegistry;
  const listPlugins = () => ({
    plugins: pluginRegistry.listPlugins(),
    userPluginsDir: pluginRegistry.ensureUserPluginsDir(),
  });
  return defineSupervisorIpcHandlers({
    confirmCrossagentRoutingOverride: (payload) =>
      runtime.confirmCrossagentRoutingOverride(payload),
    getCrossagentRouting: () => runtime.getCrossagentRoutingSnapshot(),
    listWslDistros: () => registry.listWslDistros(),
    getAgentStatuses: (payload) => registry.getAgentStatuses(payload),
    refreshAgentStatuses: (payload) => registry.refreshAgentStatuses(payload),
    getProviderUsage: (payload) => usage.getProviderUsage(payload),
    refreshProviderUsage: (payload) => usage.refreshProviderUsage(payload),
    getAgentHookPluginStatuses: (payload) => hookPlugins.getStatuses(payload),
    installAgentHookPlugin: (payload) => hookPlugins.installPlugin(payload),
    uninstallAgentHookPlugin: (payload) => hookPlugins.uninstallPlugin(payload),
    listAcpRegistry: () => registry.listAcpRegistry(),
    installAcpRegistryAgent: (payload) => registry.installAcpRegistryAgent(payload),
    updateAcpRegistryAgent: (payload) => registry.updateAcpRegistryAgent(payload),
    updateAgentBinary: (payload) => registry.updateAgentBinary(payload),
    getLatestAgentVersion: (payload) => registry.getLatestAgentVersion(payload),
    resolveAgentAccount: (payload) => registry.resolveAgentAccount(payload),
    removeAcpRegistryAgent: (payload) => registry.removeAcpRegistryAgent(payload),
    setAcpRegistryAgentAuth: (payload) => registry.setAcpRegistryAgentAuth(payload),
    authenticateAcpAgent: (payload) => registry.authenticateAcpAgent(payload),
    logoutAcpAgent: (payload) => registry.logoutAcpAgent(payload),
    getThreadSnapshots: () => threads.getThreadSnapshots(),
    getTerminalShellSnapshots: () => threads.getTerminalShellSnapshots(),
    startThread: (payload) => threads.startThread(payload),
    sendThreadInput: (payload) => threads.sendThreadInput(payload),
    interruptThread: (payload) => threads.interruptThread(payload),
    controlThreadGoal: (payload) => threads.controlThreadGoal(payload),
    rollbackThreadConversation: (payload) => threads.rollbackThreadConversation(payload),
    setPendingSteer: (payload) => threads.setPendingSteer(payload),
    clearPendingSteer: (payload) => threads.clearPendingSteer(payload),
    writeTerminal: (payload) => threads.writeTerminal(payload),
    stageThreadInput: (payload) => threads.stageThreadInput(payload),
    resizeTerminal: (payload) => threads.resizeTerminal(payload),
    resolveThreadServerRequest: (payload) => threads.resolveThreadServerRequest(payload),
    reloadAgentMcpServers: (payload) => threads.reloadAgentMcpServers(payload),
    closeThread: (payload) => threads.closeThread(payload),
    startShell: (payload) => threads.startShell(payload),
    extractContext: (payload) => generation.extractContext(payload),
    cancelExtractContext: ({ threadId }) => generation.cancelExtractContext(threadId),
    readTerminalScrollback: ({ threadId }) => threads.readTerminalScrollback(threadId),
    readTerminalSize: ({ threadId }) => threads.readTerminalSize(threadId),
    readTerminalSnapshot: ({ threadId }) => threads.readTerminalSnapshot(threadId),
    subagentSubscribe: (payload) => threads.subagentSubscribe(payload),
    subagentUnsubscribe: async (payload) => {
      threads.subagentUnsubscribe(payload);
    },
    workflowGetRun: async (payload) => {
      const { readWorkflowRun } = await import("./workflows/transcriptReader");
      // `run` is null when the manifest hasn't been written yet (normal for the
      // first few seconds after a workflow launches). Pass it through verbatim
      // so the renderer keeps the row in a "starting…" state while polling.
      const run = await readWorkflowRun({
        manifestPath: payload.manifestPath,
        location: payload.location,
        ...(payload.transcriptDir ? { transcriptDir: payload.transcriptDir } : {}),
        ...(payload.includeAgentChats ? { includeAgentChats: true } : {}),
      });
      return { run };
    },
    workflowAgentChat: async (payload) => {
      const { readWorkflowAgentChatEvents } = await import("./workflows/agentChatEvents");
      return { events: await readWorkflowAgentChatEvents(payload) };
    },
    createFileCheckpoint: async (payload) => ({
      checkpoint: await checkpoints.create(payload),
    }),
    finalizeFileCheckpoint: async (payload) => ({
      checkpoint: await checkpoints.finalize(payload),
    }),
    listFileCheckpoints: (payload) => checkpoints.list(payload),
    restoreFileCheckpoint: async (payload) => {
      await checkpoints.restore(payload);
    },
    getGitStatus: (payload) => git.getStatus(payload.projectLocation, payload.detail),
    getGitDiff: (payload) => git.getDiff(payload.projectLocation, payload.filePath, payload.staged),
    getGitDiffBatch: (payload) => git.getDiffBatch(payload.projectLocation, payload.untrackedPaths),
    getGitFileContent: (payload) =>
      git.getFileContent(payload.projectLocation, payload.filePath, payload.staged),
    gitStage: (payload) => git.stage(payload.projectLocation, payload.filePath),
    gitUnstage: (payload) => git.unstage(payload.projectLocation, payload.filePath),
    gitRevert: (payload) => git.revert(payload.projectLocation, payload.filePath),
    gitStageAll: (payload) => git.stageAll(payload.projectLocation),
    gitUnstageAll: (payload) => git.unstageAll(payload.projectLocation),
    gitRevertAll: (payload) => git.revertAll(payload.projectLocation),
    gitCommit: async (payload) => {
      const result = await git.commit(
        payload.projectLocation,
        payload.message,
        payload.addAll ?? false,
        payload.reapplyStashCommit,
      );
      return { ...result, message: payload.message };
    },
    gitInit: (payload) => git.init(payload.projectLocation),
    gitAddRemote: (payload) => git.addRemote(payload.projectLocation, payload.remote, payload.url),
    generateCommitMessage: (payload) => generation.generateCommitMessage(payload),
    generateTitle: (payload) => generation.generateTitle(payload),
    generatePrSummary: (payload) => generation.generatePrSummary(payload),
    createExperimentWorktrees: (payload) => git.createExperimentWorktrees(payload),
    removeExperimentWorktrees: (payload) => runtime.removeExperimentWorktrees(payload),
    captureExperimentSnapshot: (payload) => runtime.captureExperimentSnapshot(payload),
    judgeExperimentSnapshot: (payload) => runtime.judgeExperimentSnapshot(payload),
    getExperimentCandidateStats: (payload) =>
      git.getExperimentCandidateStats(payload.projectLocation, payload.baseRef),
    cancelJudgeExperiment: (payload) => {
      generation.cancelJudgeExperiment(payload.experimentId);
    },
    gitListBranches: (payload) => git.listBranches(payload.projectLocation, payload.includeRemote),
    gitFetch: (payload) => git.fetch(payload.projectLocation, payload.remote, payload.prune),
    gitListWorktrees: (payload) => git.listWorktrees(payload.projectLocation),
    gitAddWorktree: (payload) =>
      git.addWorktree(
        payload.projectLocation,
        payload.path,
        payload.branch,
        payload.createBranch,
        payload.startPoint,
        payload.copyIgnoredPatterns,
        payload.transferUncommitted,
        payload.keepChangesInSource,
        {
          ...(payload.worktreeRoot ? { root: payload.worktreeRoot } : {}),
          ...(payload.worktreeOmitRepoDir ? { omitRepoDir: true } : {}),
        },
        payload.sourceBranch,
        payload.ownerToken,
      ),
    gitRemoveWorktree: (payload) => runtime.gitRemoveWorktree(payload),
    gitPruneWorktrees: (payload) => runtime.gitPruneWorktrees(payload),
    gitDeleteBranch: (payload) =>
      payload.remote
        ? git.deleteRemoteBranch(payload.projectLocation, payload.remote, payload.branch)
        : git.deleteBranch(
            payload.projectLocation,
            payload.branch,
            payload.force,
            payload.expectedOwnerToken,
          ),
    gitSwitchBranch: (payload) =>
      git.switchBranch(payload.projectLocation, payload.branch, payload.createNew),
    gitPull: (payload) =>
      git.pull(payload.projectLocation, payload.remote ?? "origin", payload.preserveLocalChanges),
    gitPullRebase: (payload) =>
      git.pullRebase(
        payload.projectLocation,
        payload.remote ?? "origin",
        payload.preserveLocalChanges,
      ),
    gitPush: (payload) =>
      git.push(
        payload.projectLocation,
        payload.remote ?? "origin",
        payload.branch,
        payload.setUpstream ?? false,
      ),
    gitSync: (payload) => runtime.gitSync(payload, false),
    gitSyncRebase: (payload) => runtime.gitSync(payload, true),
    gitGetWorktreeSourceBranch: (payload) =>
      git.getWorktreeSourceBranch(
        payload.projectLocation,
        payload.branch,
        payload.sourceBranchOverride,
      ),
    gitGetWorktreeOwner: (payload) => git.getWorktreeOwner(payload.projectLocation, payload.branch),
    gitProjectSnapshot: (payload) => runtime.gitProjectSnapshot(payload),
    gitWorktreeStatusBatch: async (payload) => ({
      statuses: await git.getWorktreeStatusBatch(
        payload.projectLocation,
        payload.worktreePaths,
        payload.detail ?? "full",
      ),
    }),
    gitMergeToSource: (payload) =>
      git.mergeToSource(
        payload.projectLocation,
        payload.worktreeLocation,
        payload.worktreeBranch,
        payload.sourceBranch,
        payload.expectedWorktreeCommit,
      ),
    gitPullFromSource: (payload) =>
      git.pullFromSource(
        payload.worktreeLocation,
        payload.sourceBranch,
        payload.preserveLocalChanges,
      ),
    gitAbortMerge: (payload) =>
      git.abortMerge(payload.worktreeLocation, payload.reapplyStashCommit),
    gitFinishMerge: (payload) =>
      git.finishMerge(payload.worktreeLocation, payload.reapplyStashCommit),
    gitWatchProject: async (payload) => {
      runtime.projectWatcher.watch(payload.projectId, payload.projectLocation);
    },
    gitWatchWorktrees: async (payload) => {
      runtime.projectWatcher.watchWorktrees(payload.projectId, payload.worktreePaths);
    },
    gitUnwatchProject: async (payload) => {
      await runtime.projectWatcher.unwatch(payload.projectId);
      if (payload.releaseWslDistro) {
        runtime.releaseWslBridgeIfUnused(payload.releaseWslDistro);
      }
    },
    relocateProject: (payload) => runtime.relocateProject(payload),
    searchProjectFiles: (payload) => fileIndex.searchProjectFiles(payload),
    listProjectTree: (payload) => projectTree.listProjectTree(payload),
    browseHostDirectory: (payload) => projectTree.browseHostDirectory(payload),
    searchProjectTree: (payload) => projectTree.searchProjectTree(payload),
    readProjectFile: (payload) => projectTree.readProjectFile(payload),
    readAbsoluteFile: (payload) => projectTree.readAbsoluteFile(payload),
    readExternalFile: (payload) => projectTree.readExternalFile(payload),
    writeProjectFile: (payload) => projectTree.writeProjectFile(payload),
    writeExternalFile: (payload) => projectTree.writeExternalFile(payload),
    createProjectEntry: (payload) => projectTree.createProjectEntry(payload),
    renameProjectEntry: (payload) => projectTree.renameProjectEntry(payload),
    moveProjectEntry: (payload) => projectTree.moveProjectEntry(payload),
    deleteProjectEntry: (payload) => projectTree.deleteProjectEntry(payload),
    detectSetupScript: (payload) => runtime.detectSetupScript(payload),
    ghCheckAvailable: (payload) => github.checkGhAvailable(payload.projectLocation),
    ghCreatePr: (payload) =>
      github.createPr(
        payload.projectLocation,
        payload.branch,
        payload.baseBranch,
        payload.title,
        payload.body,
        payload.isDraft,
      ),
    ghGetPrForBranch: (payload) => github.getPrForBranch(payload.projectLocation, payload.branch),
    ghListPrs: async (payload) => ({ prs: await github.listPrs(payload.projectLocation) }),
    ghListPullRequests: (payload) => github.listPullRequests(payload.projectLocation),
    ghListWorkflows: (payload) => github.listWorkflows(payload.projectLocation),
    ghListWorkflowRuns: (payload) =>
      github.listWorkflowRuns(payload.projectLocation, payload.workflowId),
    ghGetWorkflowDefinition: (payload) =>
      github.getWorkflowDefinition(payload.projectLocation, payload.workflowId, payload.ref),
    ghGetWorkflowRun: (payload) => github.getWorkflowRun(payload.projectLocation, payload.runId),
    ghDispatchWorkflow: (payload) =>
      github.dispatchWorkflow(
        payload.projectLocation,
        payload.workflowId,
        payload.ref,
        payload.inputs,
      ),
    ghRerunWorkflowRun: (payload) =>
      github.rerunWorkflowRun(payload.projectLocation, payload.runId, payload.failedOnly),
    ghCancelWorkflowRun: (payload) =>
      github.cancelWorkflowRun(payload.projectLocation, payload.runId),
    ghDeleteWorkflowRun: (payload) =>
      github.deleteWorkflowRun(payload.projectLocation, payload.runId),
    ghMergePr: (payload) =>
      github.mergePr(payload.projectLocation, payload.prNumber, payload.method, payload.admin),
    ghClosePr: (payload) => github.closePr(payload.projectLocation, payload.prNumber),
    ghReopenPr: (payload) => github.reopenPr(payload.projectLocation, payload.prNumber),
    ghMarkPrReady: (payload) => github.markPrReady(payload.projectLocation, payload.prNumber),
    ghGetPrChecks: (payload) => github.getPrChecks(payload.projectLocation, payload.branch),
    ghGetPrFiles: (payload) => github.getPrFiles(payload.projectLocation, payload.prNumber),
    ghGetPrDiff: (payload) => github.getPrDiff(payload.projectLocation, payload.prNumber),
    ghSubmitPrReview: (payload) =>
      github.submitPrReview(
        payload.projectLocation,
        payload.prNumber,
        payload.decision,
        payload.body,
      ),
    ghUpdatePrBranch: (payload) =>
      github.updatePrBranch(payload.projectLocation, payload.prNumber, payload.rebase),
    ghGetPrDetails: (payload) => github.getPrDetails(payload.projectLocation, payload.prNumber),
    ghGetPrReviewComments: (payload) =>
      github.getPrReviewThreads(payload.projectLocation, payload.prNumber),
    ghPostPrComment: (payload) =>
      github.postPrComment(payload.projectLocation, payload.prNumber, payload.body),
    ghListAccounts: (payload) => github.listAccounts(payload.runtime),
    ghListRepos: (payload) => github.listRepos(payload.runtime, payload.account),
    cloneRepo: (payload) => runtime.cloneRepo(payload),
    lspStart: async (payload) => {
      await lsp.start(payload);
    },
    lspStop: async (payload) => {
      await lsp.stop(payload);
    },
    lspSendMessage: (payload) => lsp.sendMessage(payload),
    discoverExternalMcpServers: (payload) => externalMcpDiscovery.discover(payload),
    probeMcpServer: (payload) => mcpProbe.probe(payload),
    beginMcpServerOauth: (payload) => mcpOAuth.begin(payload),
    waitMcpServerOauth: (payload) => mcpOAuth.wait(payload),
    clearMcpServerOauth: (payload) => mcpOAuth.clear(payload),
    getMcpOauthStatus: () => mcpOAuth.status(),
    scanSkills: (payload) => skills.scan(payload),
    setSkillEnabled: (payload) => skills.setEnabled(payload),
    deleteSkill: (payload) => skills.delete(payload),
    importSkills: (payload) => skills.import(payload),
    listSkillMarketplace: (payload) => skills.listMarketplace(payload),
    installMarketplaceSkill: (payload) => skills.installMarketplace(payload),
    listPlugins: () => listPlugins(),
    refreshPlugins: () => {
      pluginRegistry.refresh();
      return listPlugins();
    },
  });
}
