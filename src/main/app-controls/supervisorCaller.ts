import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import type { AppControlsSupervisorCaller } from "./mcp/toolRegistry";

/** The typed `supervisorClient.call` both hosts hand to the app-controls MCP. */
export interface SupervisorCall {
  <Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
}

/**
 * Build the app-controls supervisor caller from a supervisor client's `call`.
 * Both the desktop (`main.ts`) and headless (`createHeadlessRemoteHost.ts`)
 * hosts wire the identical set of thin RPC wrappers, so this is the single
 * copy — each method just forwards to a named supervisor procedure.
 */
export function createAppControlsSupervisorCaller(
  call: SupervisorCall,
): AppControlsSupervisorCaller {
  return {
    getThreadSnapshots: () => call("getThreadSnapshots", {}),
    startThread: (payload) => call("startThread", payload),
    sendThreadInput: (payload) => call("sendThreadInput", payload),
    interruptThread: (payload) => call("interruptThread", payload),
    closeThread: (payload) => call("closeThread", payload),
    getProviderUsage: (payload) => call("getProviderUsage", payload),
    refreshProviderUsage: (payload) => call("refreshProviderUsage", payload),
    searchProjectFiles: (payload) => call("searchProjectFiles", payload),
    readTerminalScrollback: (payload) => call("readTerminalScrollback", payload),
    setPendingSteer: (payload) => call("setPendingSteer", payload),
    clearPendingSteer: (payload) => call("clearPendingSteer", payload),
    stageThreadInput: (payload) => call("stageThreadInput", payload),
    rollbackThreadConversation: (payload) => call("rollbackThreadConversation", payload),
    getAgentStatuses: (payload) => call("getAgentStatuses", payload),
    refreshAgentStatuses: (payload) => call("refreshAgentStatuses", payload),
    listProjectTree: (payload) => call("listProjectTree", payload),
    readProjectFile: (payload) => call("readProjectFile", payload),
    searchProjectTree: (payload) => call("searchProjectTree", payload),
    gitProjectSnapshot: (payload) => call("gitProjectSnapshot", payload),
    getGitDiff: (payload) => call("getGitDiff", payload),
    getGitDiffBatch: (payload) => call("getGitDiffBatch", payload),
    gitStage: (payload) => call("gitStage", payload),
    gitUnstage: (payload) => call("gitUnstage", payload),
    gitStageAll: (payload) => call("gitStageAll", payload),
    gitUnstageAll: (payload) => call("gitUnstageAll", payload),
    gitRevert: (payload) => call("gitRevert", payload),
    gitRevertAll: (payload) => call("gitRevertAll", payload),
    gitCommit: (payload) => call("gitCommit", payload),
    gitListBranches: (payload) => call("gitListBranches", payload),
    gitSwitchBranch: (payload) => call("gitSwitchBranch", payload),
    gitFetch: (payload) => call("gitFetch", payload),
    gitPull: (payload) => call("gitPull", payload),
    gitPullRebase: (payload) => call("gitPullRebase", payload),
    gitPush: (payload) => call("gitPush", payload),
    gitListWorktrees: (payload) => call("gitListWorktrees", payload),
    gitRemoveWorktree: (payload) => call("gitRemoveWorktree", payload),
    gitWorktreeStatusBatch: (payload) => call("gitWorktreeStatusBatch", payload),
    gitGetWorktreeSourceBranch: (payload) => call("gitGetWorktreeSourceBranch", payload),
    gitMergeToSource: (payload) => call("gitMergeToSource", payload),
    gitPullFromSource: (payload) => call("gitPullFromSource", payload),
    gitAbortMerge: (payload) => call("gitAbortMerge", payload),
    gitFinishMerge: (payload) => call("gitFinishMerge", payload),
    ghCheckAvailable: (payload) => call("ghCheckAvailable", payload),
    ghListPullRequests: (payload) => call("ghListPullRequests", payload),
    ghGetPrDetails: (payload) => call("ghGetPrDetails", payload),
    ghGetPrChecks: (payload) => call("ghGetPrChecks", payload),
    ghGetPrFiles: (payload) => call("ghGetPrFiles", payload),
    ghGetPrDiff: (payload) => call("ghGetPrDiff", payload),
    ghCreatePr: (payload) => call("ghCreatePr", payload),
    ghPostPrComment: (payload) => call("ghPostPrComment", payload),
    ghMergePr: (payload) => call("ghMergePr", payload),
    ghClosePr: (payload) => call("ghClosePr", payload),
    ghReopenPr: (payload) => call("ghReopenPr", payload),
    ghMarkPrReady: (payload) => call("ghMarkPrReady", payload),
    ghUpdatePrBranch: (payload) => call("ghUpdatePrBranch", payload),
    probeMcpServer: (payload) => call("probeMcpServer", payload),
    reloadAgentMcpServers: (payload) => call("reloadAgentMcpServers", payload),
    getMcpOauthStatus: () => call("getMcpOauthStatus", {}),
    scanSkills: (payload) => call("scanSkills", payload),
    setSkillEnabled: (payload) => call("setSkillEnabled", payload),
  };
}
