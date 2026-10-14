import type Database from "better-sqlite3";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  readAdmittedRuntimePayloadOrigin,
  type RuntimePayloadOrigin,
} from "@/shared/runtimePayloadOriginProtocol";
import {
  installTrustedRuntimePayloadOriginAfterCompleteWrite,
  readRuntimePayloadOrigin,
} from "./runtimePayloadOrigins";

/** A shallow merge owns retained evidence only when the prior whole has the same producer. */
export function originForRuntimePayloadMerge(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemId: string,
  event: RuntimeEvent,
  previous: unknown,
  next: unknown,
): RuntimePayloadOrigin | undefined {
  const current = readAdmittedRuntimePayloadOrigin(event);
  if (!current) return undefined;
  // Mirrors mergePayload's existing COMPLETE replacement branches; no provider
  // payload parsing, field/ID guesses, or inference from current thread routing.
  if (!previous || typeof previous !== "object" || !next || typeof next !== "object")
    return current;
  const prior = readRuntimePayloadOrigin(sqlite, threadId, itemId);
  return prior?.formatOwnerKey === current.formatOwnerKey &&
    prior.originFormatVersion === current.originFormatVersion
    ? current
    : undefined;
}

/** Called immediately after SQL, inside the canonical+usage transaction. */
export function installRuntimeItemPayloadOrigin(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemId: string,
  itemType: string,
  installedPayload: string | null,
  sqlChanges: number,
  origin: RuntimePayloadOrigin | undefined,
): void {
  // AFTER INSERT invalidation already ran. Ignored duplicate starts preserve
  // their prior proof and cannot certify an insertion that never occurred.
  if (sqlChanges !== 1 || !origin || itemType === "user_message") return;
  installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, {
    threadId,
    itemId,
    itemType,
    installedPayload,
    sqlChanges,
    origin,
    custody: "captured-producer-complete-payload",
  });
}
