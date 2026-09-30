import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string compare. Length is not leaked by an early return. */
export function timingSafeEqualString(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}

export function parseHarnessAuthorization(value: string | undefined): string | null {
  const match = /^harness\s+(\S+)$/i.exec(value?.trim() ?? "");
  const capability = match?.[1]?.trim() ?? "";
  return capability.length > 0 ? capability : null;
}
