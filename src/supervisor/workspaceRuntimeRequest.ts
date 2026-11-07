import { randomUUID } from "node:crypto";
import {
  CONTROLLED_WORKSPACE_RUNTIME_VERSION,
  threadWorkspaceRuntimePayloadSchema,
  CONTROLLED_WORKSPACE_RUNTIME_REQUEST,
  THREAD_WORKSPACE_RUNTIME_REQUEST,
  controlledWorkspaceRuntimePayloadSchema,
} from "@/shared/threadWorkspaceRuntimeProtocol";
import type { StartThreadResult } from "@/shared/contracts";
import type { StartThreadRuntimeInput } from "./runtime/sessionTypes";
import {
  THREAD_EXECUTION_CONTROL_VERSION,
  type ControlThreadExecutionPayload,
  type ControlThreadExecutionResult,
} from "@/shared/contracts/threadExecution";

/** One instance per supervisor process; support from a predecessor cannot authorize this child. */
export function createWorkspaceRuntimeRequestHandler(threads: {
  startThread(input: StartThreadRuntimeInput): Promise<StartThreadResult>;
  ensureThreadRunning(input: StartThreadRuntimeInput): Promise<StartThreadResult>;
  controlThreadExecution?(
    input: ControlThreadExecutionPayload,
    scope?: StartThreadRuntimeInput["workspaceScope"],
  ): Promise<ControlThreadExecutionResult>;
}) {
  const incarnation = randomUUID();
  return async (payload: unknown, requestType: string = THREAD_WORKSPACE_RUNTIME_REQUEST) => {
    const request =
      requestType === CONTROLLED_WORKSPACE_RUNTIME_REQUEST
        ? controlledWorkspaceRuntimePayloadSchema.parse(payload)
        : threadWorkspaceRuntimePayloadSchema.parse(payload);
    if (requestType === CONTROLLED_WORKSPACE_RUNTIME_REQUEST && !threads.controlThreadExecution)
      throw new Error("Controlled workspace launches are not supported by this supervisor.");
    if (request.action === "support") {
      return { version: request.version, incarnation };
    }
    if (request.incarnation !== incarnation) {
      throw new Error("Workspace runtime support belongs to a different supervisor incarnation.");
    }
    if (request.version === CONTROLLED_WORKSPACE_RUNTIME_VERSION)
      return threads.controlThreadExecution!(
        {
          version: THREAD_EXECUTION_CONTROL_VERSION,
          action: "start",
          operationId: request.operationId,
          launch: request.launch,
        },
        request.scope,
      );
    const input: StartThreadRuntimeInput = { ...request.launch, workspaceScope: request.scope };
    return threads[request.procedure](input);
  };
}
