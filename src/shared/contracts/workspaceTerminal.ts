import { z } from "zod";
import { projectLocationSchema } from "./common";
import {
  resizeTerminalPayloadSchema,
  terminalSnapshotSchema,
  writeTerminalPayloadSchema,
} from "./thread";

export const WORKSPACE_TERMINAL_READ_LIMIT = 50_000;
export const WORKSPACE_TERMINAL_CONTROL_VERSION = 1;

export const workspaceTerminalActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("read") }),
  writeTerminalPayloadSchema
    .omit({ threadId: true })
    .extend({ action: z.literal("write") })
    .strict(),
  resizeTerminalPayloadSchema
    .omit({ threadId: true })
    .extend({ action: z.literal("resize") })
    .strict(),
  z.strictObject({ action: z.literal("close") }),
]);

/** Host-to-supervisor only. The target check and effect share the PTY owner. */
export const controlWorkspaceTerminalPayloadSchema = z.strictObject({
  version: z.literal(WORKSPACE_TERMINAL_CONTROL_VERSION),
  terminalId: z.string().min(1),
  projectLocation: projectLocationSchema,
  worktreePath: z.string().min(1).optional(),
  command: workspaceTerminalActionSchema,
});
export type ControlWorkspaceTerminalPayload = z.infer<typeof controlWorkspaceTerminalPayloadSchema>;

export const controlWorkspaceTerminalResultSchema = z.discriminatedUnion("action", [
  terminalSnapshotSchema.extend({ action: z.literal("read"), truncated: z.boolean() }),
  z.object({ action: z.literal("write") }),
  z.object({ action: z.literal("resize") }),
  z.object({ action: z.literal("close"), confirmed: z.boolean() }),
]);
export type ControlWorkspaceTerminalResult = z.infer<typeof controlWorkspaceTerminalResultSchema>;
