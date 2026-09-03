import { randomBytes } from "node:crypto";

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Mint a UUIDv7 (`muse serve` requires v7 `commandId` idempotency handles for
 * `session/start` and turn submission). No new dependency — `node:crypto`
 * randomness plus the wall clock.
 */
export function mintMspCommandId(nowMs = Date.now()): string {
  const random = randomBytes(16);
  const time = BigInt(nowMs);
  random[0] = Number((time >> 40n) & 0xffn);
  random[1] = Number((time >> 32n) & 0xffn);
  random[2] = Number((time >> 24n) & 0xffn);
  random[3] = Number((time >> 16n) & 0xffn);
  random[4] = Number((time >> 8n) & 0xffn);
  random[5] = Number(time & 0xffn);
  // Version 7 in the high nibble of byte 6, variant 10xx in byte 8.
  random[6] = (random[6]! & 0x0f) | 0x70;
  random[8] = (random[8]! & 0x3f) | 0x80;
  const hex = random.toString("hex");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

export function isMspCommandId(value: string): boolean {
  return UUIDV7_RE.test(value);
}
