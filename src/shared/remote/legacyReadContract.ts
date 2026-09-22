import { z } from "zod";

/**
 * B4 legacy bulk-read admission contract (H1).
 *
 * Undeclared clients keep the complete legacy variants of `shell-snapshot`
 * (no `threadLimit`, no `reads`) and `thread-history` (no `runtimePage=1`, no
 * `reads`). Those responses are never truncated; instead each legacy read is
 * explicitly admitted (2 concurrent globally, 1 per authenticated principal)
 * and refused before materialization when a conservative stored-byte
 * reservation already exceeds {@link LEGACY_READ_RESERVATION_MAX_BYTES}.
 *
 * The reservation is NOT a serialized-size measurement and must never be
 * presented as one: it charges the exact stored UTF-8 bytes of the columns the
 * read deserializes, which is a sound lower bound on the data the read must
 * load. A reservation above the cap refuses the read with a typed 503; it never
 * shortens a response. This is the truthfulness rule that replaced the earlier
 * (wrong) "upper bound above the cap proves the wire size is above it" refusal.
 */

/** Concurrent admitted legacy bulk reads across the whole host. */
export const LEGACY_BULK_MAX_GLOBAL = 2;
/** Concurrent admitted legacy bulk reads per authenticated principal. */
export const LEGACY_BULK_MAX_PER_PRINCIPAL = 1;
/** `Retry-After` hint for an admission refusal (milliseconds). */
export const LEGACY_BULK_RETRY_AFTER_MS = 1_000;

/**
 * Pre-materialization reservation cap for one undeclared legacy read. The cap
 * is deliberately generous: ordinary legacy catalogs/histories stay far below
 * it, while a multi-gigabyte table cannot be materialized into one response.
 */
export const LEGACY_READ_RESERVATION_MAX_BYTES = 64 * 1024 * 1024;

export const LEGACY_READ_TOO_LARGE_CODE = "legacy_read_too_large";
export const LEGACY_READ_BUSY_CODE = "legacy_read_busy";

/**
 * Human/code-readable charge label carried by the pre-check refusal so no
 * consumer can mistake the reservation for an exact serialized size.
 */
export const LEGACY_READ_CHARGE_MEANING =
  "conservative-stored-byte-reservation-not-serialized-size" as const;

export const legacyReadReservationSchema = z.object({
  charge: z.literal("stored-bytes"),
  reservationBytes: z.number().int().nonnegative(),
  maxBytes: z.number().int().positive(),
  meaning: z.literal(LEGACY_READ_CHARGE_MEANING),
});
export type LegacyReadReservation = z.infer<typeof legacyReadReservationSchema>;

export const legacyReadTooLargeBodySchema = z.object({
  error: z.object({
    code: z.literal(LEGACY_READ_TOO_LARGE_CODE),
    message: z.string().min(1),
  }),
  legacyRead: z
    .object({
      resource: z.enum(["catalog", "thread-history"]),
    })
    .and(legacyReadReservationSchema),
});
export type LegacyReadTooLargeBody = z.infer<typeof legacyReadTooLargeBodySchema>;
