import { z } from "zod";
import { startThreadPayloadSchema } from "./contracts/thread";
import { controlledThreadLaunchSchema } from "./contracts/threadExecution";
import {
  workspaceDirectoryLocationSchema,
  workspaceDirectorySelectionSchema,
  workspaceGrantRevisionSchema,
} from "./workspaceDirectorySelection";

/** Host-only IPC. Never registered as a public procedure or accepted from a client. */
export const THREAD_WORKSPACE_RUNTIME_VERSION = 1;
export const THREAD_WORKSPACE_RUNTIME_REQUEST = "workspace-runtime-v1";
// Controlled starts retain their operation identity through the host-only bridge.
// V1 stays closed; an old supervisor rejects the distinct v2 request name.
export const CONTROLLED_WORKSPACE_RUNTIME_VERSION = 2;
export const CONTROLLED_WORKSPACE_RUNTIME_REQUEST = "workspace-runtime-v2";

export const approvedThreadWorkspaceScopeSchema = z.strictObject({
  primaryLocation: workspaceDirectoryLocationSchema,
  additionalDirectories: workspaceDirectorySelectionSchema,
  revision: workspaceGrantRevisionSchema,
});
export type ThreadWorkspaceRuntimeScope = z.infer<typeof approvedThreadWorkspaceScopeSchema>;

export const threadWorkspaceRuntimeSupportSchema = z.strictObject({
  version: z.literal(THREAD_WORKSPACE_RUNTIME_VERSION),
  incarnation: z.string().uuid(),
});

export const threadWorkspaceRuntimePayloadSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("support"),
    version: z.literal(THREAD_WORKSPACE_RUNTIME_VERSION),
  }),
  z.strictObject({
    action: z.literal("launch"),
    version: z.literal(THREAD_WORKSPACE_RUNTIME_VERSION),
    incarnation: z.string().uuid(),
    procedure: z.enum(["startThread", "ensureThreadRunning"]),
    launch: startThreadPayloadSchema,
    scope: approvedThreadWorkspaceScopeSchema,
  }),
]);
export type ThreadWorkspaceRuntimePayload = z.infer<typeof threadWorkspaceRuntimePayloadSchema>;
export const controlledWorkspaceRuntimeSupportSchema = threadWorkspaceRuntimeSupportSchema.extend({
  version: z.literal(CONTROLLED_WORKSPACE_RUNTIME_VERSION),
});
export const controlledWorkspaceRuntimePayloadSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("support"),
    version: z.literal(CONTROLLED_WORKSPACE_RUNTIME_VERSION),
  }),
  z.strictObject({
    action: z.literal("launch"),
    version: z.literal(CONTROLLED_WORKSPACE_RUNTIME_VERSION),
    incarnation: z.uuid(),
    operationId: z.uuid(),
    launch: controlledThreadLaunchSchema,
    scope: approvedThreadWorkspaceScopeSchema,
  }),
]);
export type ControlledWorkspaceRuntimePayload = z.infer<
  typeof controlledWorkspaceRuntimePayloadSchema
>;
export interface ThreadWorkspaceRuntimeRequest {
  id: string;
  type: typeof THREAD_WORKSPACE_RUNTIME_REQUEST | typeof CONTROLLED_WORKSPACE_RUNTIME_REQUEST;
  payload: unknown;
}

export function isThreadWorkspaceRuntimeRequest(
  value: unknown,
): value is ThreadWorkspaceRuntimeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    "payload" in value &&
    "type" in value &&
    (value.type === THREAD_WORKSPACE_RUNTIME_REQUEST ||
      value.type === CONTROLLED_WORKSPACE_RUNTIME_REQUEST)
  );
}
