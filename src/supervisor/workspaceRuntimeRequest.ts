import { randomUUID } from "node:crypto";
import {
  THREAD_WORKSPACE_RUNTIME_VERSION,
  threadWorkspaceRuntimePayloadSchema,
} from "@/shared/threadWorkspaceRuntimeProtocol";
import type { StartThreadResult } from "@/shared/contracts";
import type { StartThreadRuntimeInput } from "./runtime/sessionTypes";

/** One instance per supervisor process; support from a predecessor cannot authorize this child. */
export function createWorkspaceRuntimeRequestHandler(threads: {
  startThread(input: StartThreadRuntimeInput): Promise<StartThreadResult>;
  ensureThreadRunning(input: StartThreadRuntimeInput): Promise<StartThreadResult>;
}) {
  const incarnation = randomUUID();
  return async (payload: unknown) => {
    const request = threadWorkspaceRuntimePayloadSchema.parse(payload);
    if (request.action === "support") {
      return { version: THREAD_WORKSPACE_RUNTIME_VERSION, incarnation };
    }
    if (request.incarnation !== incarnation) {
      throw new Error("Workspace runtime support belongs to a different supervisor incarnation.");
    }
    const input: StartThreadRuntimeInput = { ...request.launch, workspaceScope: request.scope };
    return threads[request.procedure](input);
  };
}
