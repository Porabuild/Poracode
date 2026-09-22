import { z } from "zod";
import { RUNTIME_HISTORY_NOTICE_REASONS } from "../../runtimeHistoryNotice";

/**
 * B1 GUI durable-gap recovery on the remote wire.
 *
 * A thread whose canonical history lost events keeps a durable thread-level
 * notice (exactly one row per thread) after the loss is acknowledged. History
 * reads may carry it; clients that cannot render it are refused with a definite
 * 409 instead of silently appending post-gap content to a stale transcript.
 *
 * Additive on the wire: every field is optional on the reads that carry it, the
 * capability is advertised only by a host whose composition wires the durable
 * store, and the declaration is per request (`notices=v1`), so older readers
 * and older hosts are unaffected.
 */

/** Version list advertised as `capabilities.runtimeHistoryNotices.versions`. */
export const REMOTE_RUNTIME_HISTORY_NOTICES_VERSION = 1 as const;

/** Per-request transcript-read/acknowledge declaration value (`notices=v1`). */
export const REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION = "v1" as const;

export const remoteRuntimeHistoryNoticeSourceSchema = z.enum(["exact", "suspect"]);

/** The reason vocabulary is the shared reason tuple; one source of truth. */
export const remoteRuntimeHistoryNoticeReasonSchema = z.enum(RUNTIME_HISTORY_NOTICE_REASONS);

/**
 * The durable notice as a client renders it. Deliberately no thread id (the
 * request/route owns the thread) and no acknowledged token (that token is a
 * server-side idempotence key, never a client credential).
 */
export const remoteRuntimeHistoryNoticeSchema = z.object({
  kind: z.literal("history-incomplete"),
  source: remoteRuntimeHistoryNoticeSourceSchema,
  reason: remoteRuntimeHistoryNoticeReasonSchema,
  /** Cumulative lower bound of canonical events lost on this thread. */
  refusedEvents: z.number().int().nonnegative(),
  refusedBytes: z.number().int().nonnegative(),
  /** How many episodes were acknowledged on this thread. */
  acknowledgedCount: z.number().int().positive(),
  firstAcknowledgedAt: z.number().int().nonnegative(),
  lastAcknowledgedAt: z.number().int().nonnegative(),
});
export type RemoteRuntimeHistoryNotice = z.infer<typeof remoteRuntimeHistoryNoticeSchema>;

/**
 * The current UNACKNOWLEDGED episode's opaque precondition. `token` is echoed
 * back to `POST .../runtime/gap/acknowledge`; `suspect` episodes come from a
 * surviving boot touch and carry a foreign boot epoch instead of a UUID.
 */
export const remoteRuntimeGapDescriptorSchema = z.object({
  token: z.string().min(1),
  source: remoteRuntimeHistoryNoticeSourceSchema,
  reason: remoteRuntimeHistoryNoticeReasonSchema,
  refusedEvents: z.number().int().nonnegative(),
  refusedBytes: z.number().int().nonnegative(),
  /** Episode open time (exact gap `created_at` or suspect touch time). */
  createdAt: z.number().int().nonnegative(),
});
export type RemoteRuntimeGapDescriptor = z.infer<typeof remoteRuntimeGapDescriptorSchema>;

/** `GET /api/threads/{threadId}/runtime/gap` (declared: `notices=v1`). */
export const remoteRuntimeGapReadResultSchema = z.object({
  gap: remoteRuntimeGapDescriptorSchema.nullable(),
  notice: remoteRuntimeHistoryNoticeSchema.nullable(),
});
export type RemoteRuntimeGapReadResult = z.infer<typeof remoteRuntimeGapReadResultSchema>;

/** `POST /api/threads/{threadId}/runtime/gap/acknowledge` body. */
export const remoteRuntimeGapAcknowledgeBodySchema = z.object({
  threadId: z.string().min(1),
  episodeToken: z.string().min(1),
});
export type RemoteRuntimeGapAcknowledgeBody = z.infer<typeof remoteRuntimeGapAcknowledgeBodySchema>;

/**
 * The acknowledgement outcome. `applied` records the notice and clears the
 * matching episode in one durable transaction; `already` replays a previously
 * recorded acknowledgement (zero writes); `stale` means the echoed token no
 * longer matches the current episode (zero writes, `current` is the truthful
 * state — `null` when the thread is clean).
 */
export const remoteRuntimeGapAcknowledgeResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("applied"),
    notice: remoteRuntimeHistoryNoticeSchema,
    descriptor: remoteRuntimeGapDescriptorSchema,
    supersededAcceptedEvents: z.number().int().nonnegative(),
  }),
  z.object({
    outcome: z.literal("already"),
    notice: remoteRuntimeHistoryNoticeSchema,
  }),
  z.object({
    outcome: z.literal("stale"),
    current: remoteRuntimeGapDescriptorSchema.nullable(),
  }),
]);
export type RemoteRuntimeGapAcknowledgeResult = z.infer<
  typeof remoteRuntimeGapAcknowledgeResultSchema
>;
