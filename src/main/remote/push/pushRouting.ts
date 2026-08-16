import { createHash } from "node:crypto";
import {
  remotePushPayloadRoutingSchema,
  type RemotePushPayloadRouting,
  type RemotePushRegistrationRouting,
} from "@/shared/remote";
import type { StoredPushRegistration } from "./PushRegistrationStore";

/** APNs accepts up to 64 bytes; Web Push topics accept 32 characters. The same
 * composite is shared across providers, so use the stricter bound. */
export const PUSH_COLLAPSE_ID_MAX_BYTES = 32;

function addLengthPrefixed(hash: ReturnType<typeof createHash>, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  hash.update(String(bytes.length));
  hash.update(":");
  hash.update(bytes);
  hash.update(";");
}

/**
 * Produces a bounded, deterministic, collision-resistant collapse identity.
 * Length-prefixing prevents tuple ambiguity before SHA-256 hashing. Routed
 * records use the client registry UUID; legacy records use deviceId so the
 * historical API remains usable without ever placing a raw thread id in a
 * provider header.
 */
export function pushCollapseId(
  registration: Pick<StoredPushRegistration, "deviceId" | "routing">,
  desktopId: string,
  threadId: string,
): string {
  const hash = createHash("sha256");
  addLengthPrefixed(hash, registration.routing ? "routed-v1" : "legacy-v1");
  addLengthPrefixed(
    hash,
    registration.routing?.clientConnectionId.toLowerCase() ?? registration.deviceId,
  );
  addLengthPrefixed(hash, desktopId);
  addLengthPrefixed(hash, threadId);
  // 160 bits remains collision-resistant while producing 27 base64url chars;
  // with the `pc1.` prefix the provider identifier is 31 ASCII bytes.
  return `pc1.${hash.digest().subarray(0, 20).toString("base64url")}`;
}

/** Complete payload route for a v1 registration; absent for legacy clients. */
export function pushPayloadRouting(
  routing: RemotePushRegistrationRouting | undefined,
  threadId: string,
): RemotePushPayloadRouting | undefined {
  if (!routing) return undefined;
  return remotePushPayloadRoutingSchema.parse({
    ...routing,
    clientConnectionId: routing.clientConnectionId.toLowerCase(),
    threadId,
  });
}
