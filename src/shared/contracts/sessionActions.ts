import { z } from "zod";
import { assertBoundedJson } from "../jsonBounds";

function isBoundedObject(value: unknown, maxBytes: number) {
  try {
    assertBoundedJson(value, maxBytes);
    return true;
  } catch {
    return false;
  }
}

/** Capability ids only; provider callbacks and wire methods never cross IPC. */
export const threadSessionActionInfoSchema = z.object({ id: z.string().min(1).max(120) });
export const listThreadSessionActionsPayloadSchema = z.object({ threadId: z.string().min(1) });
export const listThreadSessionActionsResultSchema = z.object({
  actions: z.array(threadSessionActionInfoSchema).max(100),
});
/** Portable shape; byte/depth/lossless-JSON admission is enforced by the host,
 * like the attachment admission on sendThreadInputPortableSchema. */
export const invokeThreadSessionActionPortableSchema = z.object({
  threadId: z.string().min(1),
  actionId: z.string().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
});
export const invokeThreadSessionActionPayloadSchema =
  invokeThreadSessionActionPortableSchema.refine(
    (value) => isBoundedObject(value.payload, 64 * 1024),
    "Session action data exceeds JSON bounds.",
  );
export const invokeThreadSessionActionPortableResultSchema = z.record(z.string(), z.unknown());
export const invokeThreadSessionActionResultSchema =
  invokeThreadSessionActionPortableResultSchema.refine(
    (value) => isBoundedObject(value, 512 * 1024),
    "Session action data exceeds JSON bounds.",
  );
export type ListThreadSessionActionsPayload = z.infer<typeof listThreadSessionActionsPayloadSchema>;
export type ListThreadSessionActionsResult = z.infer<typeof listThreadSessionActionsResultSchema>;
export type InvokeThreadSessionActionPayload = z.infer<
  typeof invokeThreadSessionActionPayloadSchema
>;
export type InvokeThreadSessionActionResult = z.infer<typeof invokeThreadSessionActionResultSchema>;
