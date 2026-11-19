import { z } from "zod";
import { canonicalRequestTypeSchema, requestPayloadSchema } from "./runtimeEvent";
import { threadServerRequestIdSchema } from "./thread";

export const APP_THREAD_REQUESTS_VERSION = 1;
const requestToken = z.uuid();
const threadId = z.string().min(1);
const answer = z.union([z.string(), z.array(z.string())]);
export const appThreadReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("options"), optionIds: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ kind: z.literal("questions"), answers: z.record(z.string(), answer) }),
  z.strictObject({
    kind: z.literal("form"),
    values: z.record(z.string(), z.union([answer, z.number(), z.boolean()])),
  }),
  z.strictObject({ kind: z.literal("dismiss") }),
]);
export type AppThreadReply = z.infer<typeof appThreadReplySchema>;
export const appThreadRequestInputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("list"), threadId }),
  z.strictObject({
    action: z.literal("reply"),
    threadId,
    requestId: z.string().min(1),
    requestToken,
    reply: appThreadReplySchema,
  }),
]);
export const appThreadRequestsPayloadSchema = z.strictObject({
  version: z.literal(APP_THREAD_REQUESTS_VERSION),
  input: appThreadRequestInputSchema,
});
export type AppThreadRequestsPayload = z.infer<typeof appThreadRequestsPayloadSchema>;
export const appThreadRequestsResultSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("list"),
    requests: z.array(
      z.strictObject({
        requestId: threadServerRequestIdSchema,
        requestToken,
        requestType: canonicalRequestTypeSchema,
        payload: requestPayloadSchema,
      }),
    ),
  }),
  z.strictObject({ action: z.literal("reply"), submitted: z.literal(true) }),
]);
export type AppThreadRequestsResult = z.infer<typeof appThreadRequestsResultSchema>;
