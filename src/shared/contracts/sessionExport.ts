import { z } from "zod";

export const SESSION_EXPORT_FORMAT_VERSION = 1;
export const SESSION_EXPORT_CHUNK_BYTES = 65_536;
const threadId = z.string().min(1).max(200);
const exportTarget = { threadId, exportId: z.uuid() };
const offset = z.int().nonnegative();
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const sessionExportCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("sessions-export-start"), threadId }),
  z.strictObject({ action: z.literal("sessions-export-read"), ...exportTarget, offset }),
  z.strictObject({ action: z.literal("sessions-export-cancel"), ...exportTarget }),
]);
export type SessionExportCommand = z.infer<typeof sessionExportCommandSchema>;

const metadata = {
  formatVersion: z.literal(SESSION_EXPORT_FORMAT_VERSION),
  scope: z.literal("persisted-thread"),
  ...exportTarget,
};
export const sessionExportStartSchema = z.strictObject({
  ...metadata,
  format: z.literal("poracode-session-json"),
  chunkBytes: z.literal(SESSION_EXPORT_CHUNK_BYTES),
  expiresAt: z.int().positive(),
});
export const sessionExportReadSchema = z.discriminatedUnion("finished", [
  z.strictObject({
    ...metadata,
    offset,
    nextOffset: offset,
    data: z
      .string()
      .min(4)
      .max(4 * Math.ceil(SESSION_EXPORT_CHUNK_BYTES / 3)),
    finished: z.literal(false),
  }),
  z.strictObject({
    ...metadata,
    offset,
    nextOffset: offset,
    data: z.literal(""),
    sha256: digest,
    finished: z.literal(true),
  }),
]);
export const sessionExportCancelSchema = z.strictObject({ ...metadata, closed: z.literal(true) });
