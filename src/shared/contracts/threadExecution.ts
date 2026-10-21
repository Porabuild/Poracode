import { z } from "zod";
import { startThreadPayloadSchema, threadServerRequestIdSchema } from "./thread";
import { canonicalRequestTypeSchema, requestPayloadSchema } from "./runtimeEvent";

// Supervisor-local only. Legacy thread commands and remote clients keep their
// existing contracts; an older supervisor rejects this distinct procedure.
export const THREAD_EXECUTION_CONTROL_VERSION = 1;
const operationId = z.uuid();
const threadId = z.string().min(1).max(200);
export const controlledThreadLaunchSchema = startThreadPayloadSchema
  .safeExtend({ threadId, providerSwitch: z.never().optional() })
  .strict();
export const controlThreadExecutionPayloadSchema = z.discriminatedUnion("action", [
  z.strictObject({
    version: z.literal(THREAD_EXECUTION_CONTROL_VERSION),
    action: z.literal("prepare"),
    threadId,
  }),
  z.strictObject({
    version: z.literal(THREAD_EXECUTION_CONTROL_VERSION),
    action: z.literal("start"),
    operationId,
    launch: controlledThreadLaunchSchema,
  }),
  z.strictObject({
    version: z.literal(THREAD_EXECUTION_CONTROL_VERSION),
    action: z.literal("cancel"),
    operationId,
  }),
]);
export type ControlThreadExecutionPayload = z.infer<typeof controlThreadExecutionPayloadSchema>;
export const controlThreadExecutionResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    version: z.literal(THREAD_EXECUTION_CONTROL_VERSION),
    operationId,
    threadId,
    state: z.literal("prepared"),
  }),
  z.strictObject({
    version: z.literal(THREAD_EXECUTION_CONTROL_VERSION),
    operationId,
    threadId,
    state: z.literal("started"),
  }),
  z.strictObject({
    version: z.literal(THREAD_EXECUTION_CONTROL_VERSION),
    operationId,
    threadId,
    state: z.literal("cancelled"),
    confirmed: z.boolean(),
  }),
]);
export type ControlThreadExecutionResult = z.infer<typeof controlThreadExecutionResultSchema>;

// Distinct supervisor-only request; the existing control v1 envelope stays closed.
// Caller-known IDs permit confirmed cancellation even when a prepare reply is lost.
export const THREAD_EXECUTION_RESERVATION_VERSION = 1;
export const threadExecutionReservationPayloadSchema = z.strictObject({
  version: z.literal(THREAD_EXECUTION_RESERVATION_VERSION),
  action: z.enum(["prepare", "cancel"]),
  operationId,
  threadId,
});
export type ThreadExecutionReservationPayload = z.infer<
  typeof threadExecutionReservationPayloadSchema
>;

// A distinct supervisor-local name qualifies support before controlled launch.
// The original control/reservation v1 commands and public replies remain closed.
export const CONTROLLED_THREAD_REQUEST_VERSION = 2;
const controlledRequestTarget = {
  version: z.literal(CONTROLLED_THREAD_REQUEST_VERSION),
  operationId,
  threadId,
};
export const controlledThreadRequestPayloadSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...controlledRequestTarget, action: z.literal("qualify") }),
  z.strictObject({
    ...controlledRequestTarget,
    action: z.literal("read"),
    requestId: threadServerRequestIdSchema,
  }),
  z.strictObject({
    ...controlledRequestTarget,
    action: z.literal("respond"),
    requestId: threadServerRequestIdSchema,
    requestToken: z.uuid(),
    response: z.json(),
  }),
]);
export type ControlledThreadRequestPayload = z.infer<typeof controlledThreadRequestPayloadSchema>;
export const controlledThreadRequestResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...controlledRequestTarget, state: z.enum(["qualified", "responded"]) }),
  z.strictObject({
    ...controlledRequestTarget,
    state: z.literal("read"),
    request: z
      .strictObject({
        requestToken: z.uuid(),
        requestType: canonicalRequestTypeSchema,
        payload: requestPayloadSchema,
      })
      .nullable(),
  }),
]);
export type ControlledThreadRequestResult = z.infer<typeof controlledThreadRequestResultSchema>;
