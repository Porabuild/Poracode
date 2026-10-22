import { z } from "zod";
import { catalogItemTooLargeBodySchema } from "@/shared/remote/catalogReadContract";
import { historyItemTooLargeBodySchema } from "@/shared/remote/historyReadContract";
import { legacyReadTooLargeBodySchema } from "@/shared/remote/legacyReadContract";
import {
  IMAGE_PREVIEW_MAX_ENTRIES,
  IMAGE_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_MAX_ENTRY_BYTES,
} from "../remote/server/imagePreview";

// Read-only worker messages are internal to one installed runtime. Reject a
// stale worker before opening its connection. Database migrations and the
// optional public search capability are versioned separately.
// v2 adds the bounded conversation-search reads and revisioned index batches.
// v3 carries bounded preview snapshots and generated-preview notifications.
export const DATABASE_READ_WORKER_PROTOCOL_VERSION = 3 as const;

export const databaseImagePreviewSchema = z
  .strictObject({
    key: z.string().min(1).max(IMAGE_PREVIEW_MAX_ENTRY_BYTES),
    preview: z
      .string()
      .min(1)
      .max(IMAGE_PREVIEW_MAX_ENTRY_BYTES)
      .regex(/^data:image\//i),
  })
  .refine(
    (entry) =>
      Buffer.byteLength(entry.key, "utf8") <= IMAGE_PREVIEW_MAX_ENTRY_BYTES &&
      Buffer.byteLength(entry.preview, "utf8") <= IMAGE_PREVIEW_MAX_ENTRY_BYTES,
  );
export const databaseImagePreviewSnapshotSchema = z
  .array(databaseImagePreviewSchema)
  .max(IMAGE_PREVIEW_MAX_ENTRIES)
  .refine(
    (entries) =>
      entries.reduce(
        (sum, entry) =>
          sum + Buffer.byteLength(entry.key, "utf8") + Buffer.byteLength(entry.preview, "utf8"),
        0,
      ) <= IMAGE_PREVIEW_MAX_BYTES,
  );

export class DatabaseReadUnavailableError extends Error {
  readonly retryAfterMs = 250;
  constructor(message: string) {
    super(message);
    this.name = "DatabaseReadUnavailableError";
  }
}

const errorMessage = z.string().max(8192);
const failureSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("legacy-too-large"), body: legacyReadTooLargeBodySchema }),
  z.strictObject({ kind: z.literal("history-too-large"), body: historyItemTooLargeBodySchema }),
  z.strictObject({ kind: z.literal("catalog-too-large"), body: catalogItemTooLargeBodySchema }),
  z.strictObject({
    kind: z.literal("catalog-cursor"),
    resource: z.enum(["thread", "project"]),
    message: errorMessage,
  }),
  z.strictObject({ kind: z.literal("history-cursor"), message: errorMessage }),
  z.strictObject({
    kind: z.literal("http"),
    code: z.string(),
    status: z.number().int().min(400).max(599),
    message: errorMessage,
    retryAfterMs: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    kind: z.literal("error"),
    name: z.string(),
    message: errorMessage,
    code: z.string().optional(),
  }),
]);
export type DatabaseReadFailure = z.infer<typeof failureSchema>;

const version = z.literal(DATABASE_READ_WORKER_PROTOCOL_VERSION);
const requestId = z.number().int().positive();
export const databaseReadWorkerMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ version, kind: z.literal("ready") }),
  z.strictObject({ version, kind: z.literal("image-preview"), entry: databaseImagePreviewSchema }),
  z.strictObject({ version, kind: z.literal("result"), id: requestId, value: z.unknown() }),
  z.strictObject({ version, kind: z.literal("error"), id: requestId, error: failureSchema }),
]);
