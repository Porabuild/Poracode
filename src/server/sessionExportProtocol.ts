import { z } from "zod";
import { remoteRuntimeHistoryNoticeSchema } from "@/shared/remote/protocol/runtimeHistoryNotice";

// Local read-only snapshot child only; no provider or public remote protocol.
export const SESSION_EXPORT_WORKER_VERSION = 1;
const identity = { version: z.literal(SESSION_EXPORT_WORKER_VERSION), exportId: z.uuid() };
export const sessionExportInitializeSchema = z.strictObject({
  ...identity,
  kind: z.literal("initialize"),
  dbPath: z.string().min(1),
  threadId: z.string().min(1).max(200),
  runtimeNotice: remoteRuntimeHistoryNoticeSchema.nullable(),
});
export const sessionExportContinueSchema = z.strictObject({
  ...identity,
  kind: z.literal("continue"),
});
export const sessionExportWorkerMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...identity, kind: z.literal("ready") }),
  z.strictObject({
    ...identity,
    kind: z.literal("complete"),
    bytes: z.int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ ...identity, kind: z.literal("error") }),
]);
export type SessionExportInitialization = z.infer<typeof sessionExportInitializeSchema>;
