import { z } from "zod";
import {
  remoteThreadCommandSchema,
  resolveThreadServerRequestPayloadSchema,
  sendThreadInputPayloadSchema,
  setPendingSteerPayloadSchema,
  startThreadPayloadSchema,
  terminalSizeSchema,
  threadGoalControlSchema,
  writeTerminalPayloadSchema,
} from "../../contracts";
import { dbTruncateRuntimeItemsPayloadSchema } from "../../ipc/schemas";
import { projectNotesSchema } from "../../contracts/notes";
import { emptyJsonObjectSchema } from "./helpers";

/** Path-scoped bodies omit the path-injected `threadId`. */
export const threadRuntimeTruncateBodySchema = dbTruncateRuntimeItemsPayloadSchema.omit({
  threadId: true,
});

export const threadSendBodySchema = sendThreadInputPayloadSchema.omit({ threadId: true });

/** Goal HTTP body is the control action only; threadId is in the path. */
export const threadGoalHttpBodySchema = threadGoalControlSchema;

export const threadSteerSetBodySchema = setPendingSteerPayloadSchema.omit({ threadId: true });

export const terminalWriteBodySchema = writeTerminalPayloadSchema.omit({ threadId: true });

export const terminalResizeBodySchema = terminalSizeSchema;

export const requestResolveBodySchema = resolveThreadServerRequestPayloadSchema.omit({
  threadId: true,
});

export const pathScopedEmptyBodySchema = emptyJsonObjectSchema;

const threadCommandVariants = remoteThreadCommandSchema.options.map((variant) => {
  const { threadId: _threadId, ...shape } = variant.shape;
  return z.object(shape);
});

export const threadCommandBodySchema = z.discriminatedUnion("kind", [
  threadCommandVariants[0]!,
  threadCommandVariants[1]!,
  ...threadCommandVariants.slice(2),
]);

/** `/api/threads/start` requires an existing thread id. */
export const startExistingThreadBodySchema = startThreadPayloadSchema.extend({
  threadId: z.string().min(1),
});

export const projectNotesReadResultSchema = z.object({
  notes: projectNotesSchema.nullable(),
});

/** Project identity is authoritative from `/api/projects/{projectId}/notes`. */
export const projectNotesWriteBodySchema = projectNotesSchema.omit({ projectId: true });
