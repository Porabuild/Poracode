import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Thread } from "@/shared/contracts";
import type { BackendNativeRequest } from "@/shared/backendHostProtocol";
import {
  appThreadTransferNotStartedSchema,
  appThreadTransferResultSchema,
  type AppThreadTransferInput,
  type AppThreadTransferNotStarted,
  type AppThreadTransferResult,
} from "@/shared/contracts/appThreadTransfer";
import { canTransferThread } from "@/shared/threadTransfer";
import { dbAssertNoRunningCheckpointRevert, dbGetThread, dbUpdateThreadMetadata } from "@/host/db";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import { applyThreadMetadataCommand } from "@/host/remote/server/threadMetadataCommands";
import { assertRemoteThreadStartExperimentSafe } from "@/host/remote/experimentOwnership";
import {
  commandOutcomeUncertainAfterEffect,
  runRemoteCommand,
} from "@/host/remote/server/remoteCommandIdempotency";

/** The desktop client already holds the applicable pairing grants for both hosts. */
export async function runDesktopAppThreadTransfer(
  sourceHostId: string,
  input: AppThreadTransferInput,
  requestNative: (request: BackendNativeRequest) => Promise<unknown>,
  archiveSource: (source: Thread) => Promise<boolean>,
): Promise<AppThreadTransferResult> {
  let reconciling = false;
  const call = async (ids?: {
    transferId: string;
    targetThreadId: string;
    sourceHostId: string;
  }) => {
    const response = await requestNative({
      operation: "thread-transfer",
      payload: {
        version: 1,
        input,
        ...(ids ? { ids } : {}),
        ...(reconciling ? { reconcile: true } : {}),
      },
    });
    const refused = appThreadTransferNotStartedSchema.safeParse(response);
    if (refused.success) return refused.data;
    const result = appThreadTransferResultSchema.parse(response);
    if (result.action !== input.action) {
      throw new Error("The desktop answered a different transfer action.");
    }
    if (
      ids &&
      (result.action !== "move" ||
        result.threadId !== ids.targetThreadId ||
        (result.recovered === true) !== reconciling ||
        input.action !== "move" ||
        result.destinationProjectId !== input.destinationProjectId)
    )
      throw new Error("The desktop answered for a different transfer destination.");
    return result;
  };
  if (input.action !== "move") {
    if (!dbGetThread(input.threadId)) throw new Error("The source thread does not exist.");
    const result = await call();
    if ("type" in result) throw new Error(result.message);
    return result;
  }

  // Stable ids let the destination's existing commit receipt find its row even
  // when the desktop or the source host restarts between commit and reply.
  const token = createHash("sha256")
    .update(JSON.stringify([sourceHostId, input.operationKey]))
    .digest("hex")
    .slice(0, 32);
  const ids = { transferId: `appctl-${token}`, targetThreadId: `moved-${token}`, sourceHostId };
  const result = await runRemoteCommand<AppThreadTransferResult | AppThreadTransferNotStarted>({
    commandId: `app-controls:thread-transfer:${token}`,
    route: "app-controls:thread_transfer",
    principalId: "app-controls",
    requestPayload: input,
    reconcileUncertain: () => {
      reconciling = true;
      return { kind: "resume" };
    },
    isRetryableResult: (response) => !reconciling && "type" in response,
    operation: async (markDispatched) => {
      const source = dbGetThread(input.threadId);
      if (!reconciling && (!source || source.archived))
        throw new Error("Choose a saved, non-archived source thread.");
      if (!reconciling) assertRemoteThreadStartExperimentSafe(input.threadId);
      markDispatched();
      try {
        const moved = await call(ids);
        if ("type" in moved) {
          if (!reconciling) return moved;
          throw new Error(moved.message);
        }
        if (moved.action !== "move") throw new Error("The desktop did not confirm the move.");
        if (reconciling) {
          return { ...moved, sourceArchived: dbGetThread(input.threadId)?.archived === true };
        }
        if (!source) throw new Error("The source thread was removed.");
        const sourceArchived = await archiveSource(source).catch((error: unknown) => {
          console.warn(
            "[app-controls] transfer destination saved but source archive failed:",
            error,
          );
          return dbGetThread(source.id)?.archived === true;
        });
        return { ...moved, sourceArchived };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The desktop disconnected.";
        throw commandOutcomeUncertainAfterEffect(
          new Error(`${detail} Check for thread ${ids.targetThreadId} on the destination.`),
        );
      }
    },
  });
  if ("type" in result) throw new Error(result.message);
  return result;
}

/** Archive only the incarnation exported by the move, under the source's dispatch lock. */
export function archiveTransferredThread(
  supervisor: Pick<SupervisorClient, "runThreadMutation" | "call">,
  source: Thread,
  publish: (threadId: string) => void,
): Promise<boolean> {
  return supervisor.runThreadMutation(source.id, async () => {
    const sameThread = (current: Thread | null): current is Thread =>
      current !== null &&
      current.createdAt === source.createdAt &&
      current.projectId === source.projectId &&
      current.worktreePath === source.worktreePath;
    const matches = (current: Thread | null): current is Thread =>
      sameThread(current) &&
      current.agentKind === source.agentKind &&
      current.agentInstanceId === source.agentInstanceId &&
      current.updatedAt === source.updatedAt &&
      isDeepStrictEqual(current.sessionRef, source.sessionRef);
    const current = dbGetThread(source.id);
    if (sameThread(current) && current.archived) return true;
    if (!matches(current) || !canTransferThread(current)) return false;
    assertRemoteThreadStartExperimentSafe(source.id);
    dbAssertNoRunningCheckpointRevert([source.id]);
    const snapshots = await supervisor.call("getThreadSnapshots", {});
    const live = snapshots.find((snapshot) => snapshot.threadId === source.id);
    if (
      live &&
      !canTransferThread({ presentationMode: current.presentationMode, status: live.status })
    ) {
      return false;
    }
    const beforeClose = dbGetThread(source.id);
    if (!matches(beforeClose) || !canTransferThread(beforeClose)) return false;
    const { confirmed } = await supervisor.call("closeThreadConfirmed", { threadId: source.id });
    if (!confirmed || !matches(dbGetThread(source.id))) return false;
    const archived = dbUpdateThreadMetadata(source.id, (thread) =>
      applyThreadMetadataCommand(thread, { kind: "archive", threadId: source.id }),
    );
    if (!archived) return false;
    publish(source.id);
    return true;
  });
}
