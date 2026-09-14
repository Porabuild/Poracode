import { z } from "zod";
import {
  REMOTE_HTTP_BRIDGE_METHODS,
  REMOTE_HTTP_MAX_REQUEST_BODY_BYTES,
  REMOTE_HTTP_MAX_URL_LENGTH,
  isHeaderBudgetWithinBounds,
  type RemoteHttpBridgeHeaders,
} from "./httpBridgeProtocol";

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isHeaderBudgetWithinBoundsForSchema(headers: RemoteHttpBridgeHeaders): boolean {
  return isHeaderBudgetWithinBounds(headers);
}

/** Main-side admission metadata. Strict by design: a body field is an error, not a silent drop. */
export const remoteHttpBridgeOpenRequestSchema = z
  .object({
    requestId: z.uuid(),
    url: z
      .string()
      .min(1)
      .max(REMOTE_HTTP_MAX_URL_LENGTH)
      .refine(isHttpUrl, { message: "remote HTTP bridge only supports http(s) URLs" }),
    method: z.enum(REMOTE_HTTP_BRIDGE_METHODS),
    headers: z.record(z.string(), z.string()).default({}),
    hasBody: z.boolean(),
    bodyBytes: z.number().int().min(0).max(REMOTE_HTTP_MAX_REQUEST_BODY_BYTES),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isHeaderBudgetWithinBoundsForSchema(value.headers)) {
      context.addIssue({
        code: "custom",
        path: ["headers"],
        message: "remote HTTP bridge header budget exceeded",
      });
    }
  });

export const remoteHttpBridgeCancelRequestSchema = z.object({ requestId: z.uuid() }).strict();
