import { z } from "zod";
import {
  REMOTE_COMMAND_ID_HEADER,
  REMOTE_PROCEDURE_SPECS,
  isRemoteFollowUpQueueProcedure,
  isRemoteProcedure,
  remoteRuntimeItemsPageSchema,
  remoteThreadSnapshotSchema,
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteThreadSnapshot,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  CHECKPOINT_REVERT_COMMAND_ID_PREFIX,
  checkpointRevertPayloadSchema,
  checkpointRevertResultSchema,
  controlThreadGoalPayloadSchema,
  sendThreadInputPayloadSchema,
  type CheckpointRevertResult,
  type ControlThreadGoalPayload,
  type RemoteThreadCommand,
  type ResizeTerminalPayload,
  type SendThreadInputPayload,
  type SetPendingSteerPayload,
  type StartShellPayload,
  type StartThreadResult,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  ipcProcedureMap,
  jsonCallEnvelopeSchema,
  omittedCallEnvelopeSchema,
  omittedResultSchema,
} from "@/shared/ipc";
import { RemoteClientHostApi } from "./clientApiHost";
import { RemoteClientError } from "./clientErrors";
import { parseResponse } from "./clientParse";
import {
  LONG_REMOTE_REQUEST_TIMEOUT_MS,
  type StartRemoteNewThreadInput,
  type StartRemoteThreadInput,
  type ThreadHistoryOptions,
} from "./clientTypes";

export abstract class RemoteClientThreadsApi extends RemoteClientHostApi {
  async threadHistory(
    threadId: string,
    options: ThreadHistoryOptions = {},
  ): Promise<RemoteThreadSnapshot> {
    const search = new URLSearchParams({
      runtimePage: "1",
      ...(options.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: String(options.targetTimelineEntryCount) }
        : {}),
      ...(options.omitScrollback ? { omitScrollback: "1" } : {}),
    });
    return remoteThreadSnapshotSchema.parse(
      await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/history?${search}`),
    );
  }

  async threadRuntimeItemsPage(
    input: RemoteRuntimeItemsPageRequest,
  ): Promise<RemoteRuntimeItemsPage> {
    const search = new URLSearchParams({
      limit: String(input.limit),
      ...(input.beforePosition !== undefined
        ? { beforePosition: String(input.beforePosition) }
        : {}),
      ...(input.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: String(input.targetTimelineEntryCount) }
        : {}),
    });
    return remoteRuntimeItemsPageSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(input.threadId)}/history/items?${search}`,
      ),
    );
  }

  async startThread(input: StartRemoteThreadInput): Promise<StartThreadResult> {
    const result = await this.requestJson("/api/threads/start", {
      method: "POST",
      headers: {
        // Never reuse a send-path userMessageItemId: receipts reject the same
        // command id across routes, and a failed /send must still be able to
        // fall back to /start for unknown-session resume.
        [REMOTE_COMMAND_ID_HEADER]: input.userMessageItemId
          ? `thread-start-item:${input.userMessageItemId}`
          : input.threadId
            ? `thread-start:${input.threadId}`
            : crypto.randomUUID(),
      },
      body: {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        projectLocation: input.projectLocation,
        agentKind: input.agentKind,
        ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
        config: input.config,
        prompt: input.prompt,
        ...(input.segments && input.segments.length > 0 ? { segments: input.segments } : {}),
        initialSize: input.initialSize ?? DEFAULT_TERMINAL_SIZE,
        ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
        ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
        ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
        ...(input.providerSwitch ? { providerSwitch: input.providerSwitch } : {}),
        ...(input.ensureRunning ? { ensureRunning: true } : {}),
      },
    });
    return parseResponse(z.object({ threadId: z.string() }), result, "thread");
  }

  async startNewThread(input: StartRemoteNewThreadInput): Promise<StartThreadResult> {
    const threadId = input.threadId ?? crypto.randomUUID();
    await this.sendThreadCommand({
      kind: "start",
      threadId,
      projectId: input.projectId,
      agentKind: input.agentKind,
      ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
      config: input.config,
      prompt: input.prompt,
      ...(input.segments && input.segments.length > 0 ? { segments: [...input.segments] } : {}),
      ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
      ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
      ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
      ...(input.groupName ? { groupName: input.groupName } : {}),
    });
    return { threadId };
  }

  async sendThreadInput(input: SendThreadInputPayload): Promise<void> {
    const parsed = sendThreadInputPayloadSchema.parse(input);
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/send`, {
      method: "POST",
      headers: {
        [REMOTE_COMMAND_ID_HEADER]: parsed.userMessageItemId ?? crypto.randomUUID(),
      },
      body: {
        prompt: parsed.prompt,
        config: parsed.config,
        ...(parsed.segments ? { segments: parsed.segments } : {}),
        ...(parsed.userMessageItemId ? { userMessageItemId: parsed.userMessageItemId } : {}),
      },
    });
  }

  async interruptThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/interrupt`, {
      method: "POST",
    });
  }

  async controlThreadGoal(input: ControlThreadGoalPayload): Promise<void> {
    const { threadId, ...body } = controlThreadGoalPayloadSchema.parse(input);
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/goal`, {
      method: "POST",
      body,
    });
  }

  async closeThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/close`, {
      method: "POST",
    });
  }

  async truncateThreadRuntimeAfter(input: {
    readonly threadId: string;
    readonly itemId: string;
  }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/runtime/truncate`, {
      method: "POST",
      body: { itemId: input.itemId },
    });
  }

  /** WS2 stage 4: the backend-owned compound checkpoint revert. */
  async checkpointRevert(input: {
    readonly threadId: string;
    readonly checkpointItemId: string;
    readonly operationKey: string;
  }): Promise<CheckpointRevertResult> {
    const parsed = checkpointRevertPayloadSchema.parse(input);
    return checkpointRevertResultSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(parsed.threadId)}/checkpoint-revert`,
        {
          method: "POST",
          headers: {
            [REMOTE_COMMAND_ID_HEADER]: `${CHECKPOINT_REVERT_COMMAND_ID_PREFIX}${parsed.operationKey}`,
          },
          body: {
            checkpointItemId: parsed.checkpointItemId,
            operationKey: parsed.operationKey,
          },
        },
      ),
    );
  }

  async setPendingSteer(input: SetPendingSteerPayload): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/steer/set`, {
      method: "POST",
      body: {
        prompt: input.prompt,
        ...(input.segments ? { segments: input.segments } : {}),
        config: input.config,
      },
    });
  }

  async clearPendingSteer(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/steer/clear`, {
      method: "POST",
    });
  }

  /** Thread-metadata mutation (rename, done, pin, archive, delete). */
  async sendThreadCommand(command: RemoteThreadCommand): Promise<void> {
    const { threadId, ...body } = command;
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/command`, {
      method: "POST",
      ...(command.kind === "start"
        ? { headers: { [REMOTE_COMMAND_ID_HEADER]: `thread-start:${threadId}` } }
        : {}),
      body,
    });
  }

  async writeTerminal(input: { readonly threadId: string; readonly data: string }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/terminal/write`, {
      method: "POST",
      body: { data: input.data },
    });
  }

  async resizeTerminal(input: ResizeTerminalPayload): Promise<void> {
    const { threadId, ...body } = input;
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/terminal/resize`, {
      method: "POST",
      body,
    });
  }

  /** Spawns a dev shell (the id is `shellId`, not scoped to a thread). */
  async startShell(input: StartShellPayload): Promise<void> {
    await this.requestJson(`/api/terminal/start`, { method: "POST", body: input });
  }

  /** Tears down a terminal PTY (CLI thread or dev shell) by id. */
  async closeShell(input: { readonly threadId: string }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/terminal/close`, {
      method: "POST",
      body: {},
    });
  }

  async resolveRequest(input: {
    readonly threadId: string;
    readonly requestId: ThreadServerRequestId;
    readonly method: string;
    readonly response: unknown;
  }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/requests/resolve`, {
      method: "POST",
      body: {
        requestId: input.requestId,
        method: input.method,
        response: input.response,
      },
    });
  }

  /**
   * Generic supervisor passthrough to the paired desktop. The reused desktop
   * project controls call bridge methods, which
   * the remote bridge shim forwards here (see bridge.ts). `procedure` is one of
   * the allowlisted names in REMOTE_PROCEDURE_SPECS; the server validates
   * it.
   */
  async callRemoteProcedure(procedure: string, payload: unknown): Promise<unknown> {
    try {
      if (!isRemoteProcedure(procedure)) {
        throw new RemoteClientError(
          `Procedure "${procedure}" is not available to remote clients.`,
          403,
          "git_procedure_not_allowed",
        );
      }
      const spec = REMOTE_PROCEDURE_SPECS[procedure];
      const envelope = await this.requestJson("/api/git/call", {
        method: "POST",
        body: { procedure, payload },
        ...("timeout" in spec && spec.timeout === "long"
          ? { timeoutMs: LONG_REMOTE_REQUEST_TIMEOUT_MS }
          : {}),
      });
      const resultSchema = ipcProcedureMap[procedure].resultSchema;
      if (!resultSchema) {
        throw new RemoteClientError(
          `Procedure "${procedure}" is missing an authoritative result schema.`,
          500,
          "git_procedure_result_schema_missing",
        );
      }
      if (resultSchema === omittedResultSchema) {
        parseResponse(omittedCallEnvelopeSchema, envelope, `procedure ${procedure}`);
        return undefined;
      }
      return parseResponse(jsonCallEnvelopeSchema(resultSchema), envelope, `procedure ${procedure}`)
        .result;
    } catch (error) {
      // A host from before
      // queued follow-ups knows the passthrough endpoint but rejects these new
      // procedure names; turn that capability miss into a stable, actionable
      // error. Never retry through setPendingSteer: queue and steer have
      // intentionally different semantics.
      if (
        isRemoteFollowUpQueueProcedure(procedure) &&
        error instanceof RemoteClientError &&
        ((error.status === 403 && error.code === "git_procedure_not_allowed") ||
          (error.status === 404 && error.code === "not_found"))
      ) {
        throw new RemoteClientError(
          msg("supervisor.followUpQueue.unsupported"),
          501,
          "follow_up_queue_unsupported",
          { cause: error },
        );
      }
      throw error;
    }
  }
}
