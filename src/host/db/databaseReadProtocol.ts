import { z } from "zod";
import { catalogItemTooLargeBodySchema } from "@/shared/remote/catalogReadContract";
import { historyItemTooLargeBodySchema } from "@/shared/remote/historyReadContract";
import { legacyReadTooLargeBodySchema } from "@/shared/remote/legacyReadContract";

// Read-only worker messages are internal to one installed runtime. Reject a
// stale worker before opening its connection; persisted SQLite and HTTP shapes
// stay unchanged, so neither database schema nor remote protocol needs a bump.
export const DATABASE_READ_WORKER_PROTOCOL_VERSION = 1 as const;

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
  z.strictObject({ version, kind: z.literal("result"), id: requestId, value: z.unknown() }),
  z.strictObject({ version, kind: z.literal("error"), id: requestId, error: failureSchema }),
]);
