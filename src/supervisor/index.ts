import type {
  CloseThreadPayload,
  GenerateCommitMessagePayload,
  GenerateTitlePayload,
  GetGitBranchesPayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  GetGitStatusPayload,
  GitAddWorktreePayload,
  GitCommitPayload,
  GitDeleteBranchPayload,
  GitFetchPayload,
  GitListWorktreesPayload,
  GitPullPayload,
  GitPushPayload,
  GitRemoveWorktreePayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitSyncPayload,
  GitUnstageAllPayload,
  SearchProjectFilesPayload,
  GitUnstagePayload,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  StartShellPayload,
  StartThreadPayload,
  WriteTerminalPayload,
} from "../shared/contracts";
import type { SupervisorReply, SupervisorRequest } from "../shared/ipc";
import {
  closeThreadPayloadSchema,
  getAgentStatusesPayloadSchema,
  getGitBranchesPayloadSchema,
  getGitDiffBatchPayloadSchema,
  getGitDiffPayloadSchema,
  getGitStatusPayloadSchema,
  gitAddWorktreePayloadSchema,
  gitCommitPayloadSchema,
  gitFetchPayloadSchema,
  gitListWorktreesPayloadSchema,
  gitPullPayloadSchema,
  gitPushPayloadSchema,
  gitDeleteBranchPayloadSchema,
  gitRemoveWorktreePayloadSchema,
  gitSyncPayloadSchema,
  searchProjectFilesPayloadSchema,
  generateCommitMessagePayloadSchema,
  generateTitlePayloadSchema,
  gitRevertAllPayloadSchema,
  gitRevertPayloadSchema,
  gitStageAllPayloadSchema,
  gitStagePayloadSchema,
  gitUnstageAllPayloadSchema,
  gitUnstagePayloadSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  sendThreadInputPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  writeTerminalPayloadSchema,
} from "../shared/contracts";
import { SupervisorRuntime } from "./runtime";

const runtime = new SupervisorRuntime((event) => {
  process.send?.(event);
});

async function handleRequest(request: SupervisorRequest): Promise<unknown> {
  switch (request.type) {
    case "listWslDistros":
      return runtime.listWslDistros();
    case "getAgentStatuses":
      return runtime.getAgentStatuses(getAgentStatusesPayloadSchema.parse(request.payload));
    case "getThreadSnapshots":
      return runtime.getThreadSnapshots();
    case "startThread":
      return runtime.startThread(
        startThreadPayloadSchema.parse(request.payload) as StartThreadPayload,
      );
    case "sendThreadInput":
      return runtime.sendThreadInput(
        sendThreadInputPayloadSchema.parse(request.payload) as SendThreadInputPayload,
      );
    case "writeTerminal":
      return runtime.writeTerminal(
        writeTerminalPayloadSchema.parse(request.payload) as WriteTerminalPayload,
      );
    case "resizeTerminal":
      return runtime.resizeTerminal(
        resizeTerminalPayloadSchema.parse(request.payload) as ResizeTerminalPayload,
      );
    case "getThreadHistory":
      return runtime.getThreadHistory(request.payload.threadId);
    case "resolveThreadServerRequest":
      return runtime.resolveThreadServerRequest(
        resolveThreadServerRequestPayloadSchema.parse(
          request.payload,
        ) as ResolveThreadServerRequestPayload,
      );
    case "closeThread":
      return runtime.closeThread(
        closeThreadPayloadSchema.parse(request.payload) as CloseThreadPayload,
      );
    case "startShell":
      return runtime.startShell(
        startShellPayloadSchema.parse(request.payload) as StartShellPayload,
      );
    case "getGitStatus":
      return runtime.getGitStatus(
        getGitStatusPayloadSchema.parse(request.payload) as GetGitStatusPayload,
      );
    case "getGitDiff":
      return runtime.getGitDiff(
        getGitDiffPayloadSchema.parse(request.payload) as GetGitDiffPayload,
      );
    case "getGitDiffBatch":
      return runtime.getGitDiffBatch(
        getGitDiffBatchPayloadSchema.parse(request.payload) as GetGitDiffBatchPayload,
      );
    case "gitStage":
      return runtime.gitStage(gitStagePayloadSchema.parse(request.payload) as GitStagePayload);
    case "gitUnstage":
      return runtime.gitUnstage(
        gitUnstagePayloadSchema.parse(request.payload) as GitUnstagePayload,
      );
    case "gitRevert":
      return runtime.gitRevert(gitRevertPayloadSchema.parse(request.payload) as GitRevertPayload);
    case "gitStageAll":
      return runtime.gitStageAll(
        gitStageAllPayloadSchema.parse(request.payload) as GitStageAllPayload,
      );
    case "gitUnstageAll":
      return runtime.gitUnstageAll(
        gitUnstageAllPayloadSchema.parse(request.payload) as GitUnstageAllPayload,
      );
    case "gitRevertAll":
      return runtime.gitRevertAll(
        gitRevertAllPayloadSchema.parse(request.payload) as GitRevertAllPayload,
      );
    case "gitCommit":
      return runtime.gitCommit(gitCommitPayloadSchema.parse(request.payload) as GitCommitPayload);
    case "generateCommitMessage":
      return runtime.generateCommitMessage(
        generateCommitMessagePayloadSchema.parse(request.payload) as GenerateCommitMessagePayload,
      );
    case "generateTitle":
      return runtime.generateTitle(
        generateTitlePayloadSchema.parse(request.payload) as GenerateTitlePayload,
      );
    case "gitListBranches":
      return runtime.gitListBranches(
        getGitBranchesPayloadSchema.parse(request.payload) as GetGitBranchesPayload,
      );
    case "gitFetch":
      return runtime.gitFetch(gitFetchPayloadSchema.parse(request.payload) as GitFetchPayload);
    case "gitListWorktrees":
      return runtime.gitListWorktrees(
        gitListWorktreesPayloadSchema.parse(request.payload) as GitListWorktreesPayload,
      );
    case "gitAddWorktree":
      return runtime.gitAddWorktree(
        gitAddWorktreePayloadSchema.parse(request.payload) as GitAddWorktreePayload,
      );
    case "gitRemoveWorktree":
      return runtime.gitRemoveWorktree(
        gitRemoveWorktreePayloadSchema.parse(request.payload) as GitRemoveWorktreePayload,
      );
    case "gitDeleteBranch":
      return runtime.gitDeleteBranch(
        gitDeleteBranchPayloadSchema.parse(request.payload) as GitDeleteBranchPayload,
      );
    case "gitPull":
      return runtime.gitPull(gitPullPayloadSchema.parse(request.payload) as GitPullPayload);
    case "gitPush":
      return runtime.gitPush(gitPushPayloadSchema.parse(request.payload) as GitPushPayload);
    case "gitSync":
      return runtime.gitSync(gitSyncPayloadSchema.parse(request.payload) as GitSyncPayload);
    case "searchProjectFiles":
      return runtime.searchProjectFiles(
        searchProjectFilesPayloadSchema.parse(request.payload) as SearchProjectFilesPayload,
      );
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}

process.on("message", async (message: SupervisorRequest) => {
  const reply = await handleRequest(message)
    .then(
      (data): SupervisorReply => ({
        replyTo: message.id,
        ok: true,
        data,
      }),
    )
    .catch(
      (error: unknown): SupervisorReply => ({
        replyTo: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  process.send?.(reply);
});

process.on("disconnect", () => {
  runtime.dispose();
  process.exit(0);
});
