import { dbMeasureLegacyHistoryCharge, dbMeasureLegacySnapshotCharge } from "@/host/db";
import type {
  LegacyHistoryChargeOptions,
  LegacySnapshotChargeOptions,
} from "@/host/db/legacyReadCharge";
import {
  LEGACY_BULK_RETRY_AFTER_MS,
  LEGACY_READ_CHARGE_MEANING,
  LEGACY_READ_RESERVATION_MAX_BYTES,
  LEGACY_READ_TOO_LARGE_CODE,
  type LegacyReadTooLargeBody,
} from "@/shared/remote/legacyReadContract";

/**
 * B4 legacy bulk-read pre-check (H1).
 *
 * Runs before the undeclared legacy read materializes anything, and measures
 * the selection the delegated legacy handler will actually read (its parsed
 * `threadLimit`/`runtimePage`/`omitScrollback`/`targetTimelineEntryCount`). The
 * caller must parse and validate that query with the handler's own helper
 * BEFORE calling the pre-check, so an invalid bound surfaces as the handler's
 * 400 instead of a reservation 503 that would mask it.
 *
 * The measured value is a **stored-byte reservation** (a sound lower bound on
 * the data the read must deserialize), labelled as such in the refusal body —
 * it is not a serialized wire-size claim and never truncates a response. A read
 * whose reservation is within the cap is served complete.
 */

export function legacySnapshotReservationBytes(options: LegacySnapshotChargeOptions = {}): number {
  const charge = dbMeasureLegacySnapshotCharge(options);
  return charge.threadsStoredBytes + charge.projectsStoredBytes;
}

export function legacyHistoryReservationBytes(
  threadId: string,
  options: LegacyHistoryChargeOptions = {},
): number {
  const charge = dbMeasureLegacyHistoryCharge(threadId, options);
  return (
    charge.itemsStoredBytes +
    charge.streamTailStoredBytes +
    charge.completedTurnsStoredBytes +
    charge.scrollbackStoredBytes +
    charge.contextUsageStoredBytes
  );
}

export class LegacyReadTooLargeError extends Error {
  constructor(readonly body: LegacyReadTooLargeBody) {
    super(`The legacy read reservation exceeds ${LEGACY_READ_RESERVATION_MAX_BYTES} bytes.`);
    this.name = "LegacyReadTooLargeError";
  }
}

function refuse(
  resource: "catalog" | "thread-history",
  reservationBytes: number,
  maxBytes: number,
): never {
  throw new LegacyReadTooLargeError({
    error: {
      code: LEGACY_READ_TOO_LARGE_CODE,
      message:
        `This ${resource === "catalog" ? "catalog" : "thread history"} needs more storage than the ` +
        `${maxBytes}-byte legacy read reservation; use a bounded ` +
        `reads=bounded-v1 request or export instead.`,
    },
    legacyRead: {
      resource,
      charge: "stored-bytes",
      reservationBytes,
      maxBytes,
      meaning: LEGACY_READ_CHARGE_MEANING,
    },
  });
}

/**
 * `maxBytes` defaults to the contract cap; tests pass a small value to exercise
 * the refusal path without materializing a multi-megabyte fixture. Production
 * callers never pass it.
 */
export function assertLegacySnapshotWithinReservation(
  options: LegacySnapshotChargeOptions = {},
  maxBytes: number = LEGACY_READ_RESERVATION_MAX_BYTES,
): number {
  const reservationBytes = legacySnapshotReservationBytes(options);
  if (reservationBytes > maxBytes) refuse("catalog", reservationBytes, maxBytes);
  return reservationBytes;
}

export function assertLegacyHistoryWithinReservation(
  threadId: string,
  options: LegacyHistoryChargeOptions = {},
  maxBytes: number = LEGACY_READ_RESERVATION_MAX_BYTES,
): number {
  const reservationBytes = legacyHistoryReservationBytes(threadId, options);
  if (reservationBytes > maxBytes) refuse("thread-history", reservationBytes, maxBytes);
  return reservationBytes;
}

export function legacyReadRetryAfterSeconds(): number {
  return Math.max(1, Math.ceil(LEGACY_BULK_RETRY_AFTER_MS / 1_000));
}
