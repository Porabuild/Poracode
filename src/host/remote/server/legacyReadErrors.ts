import {
  LEGACY_READ_RESERVATION_MAX_BYTES,
  type LegacyReadTooLargeBody,
} from "@/shared/remote/legacyReadContract";

export class LegacyReadTooLargeError extends Error {
  constructor(readonly body: LegacyReadTooLargeBody) {
    super(`The legacy read reservation exceeds ${LEGACY_READ_RESERVATION_MAX_BYTES} bytes.`);
    this.name = "LegacyReadTooLargeError";
  }
}
