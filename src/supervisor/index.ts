import type {
  CloseThreadPayload,
  GenerateCommitMessagePayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  GetGitStatusPayload,
  GitCommitPayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitUnstageAllPayload,
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
  getGitDiffBatchPayloadSchema,
  getGitDiffPayloadSchema,
  getGitStatusPayloadSchema,
  gitCommitPayloadSchema,
  generateCommitMessagePayloadSchema,
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
