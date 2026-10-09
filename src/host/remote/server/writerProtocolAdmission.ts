import type { IncomingMessage } from "node:http";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { RemoteHttpError } from "../auth";

/**
 * Fence 1 (remote 12→13): per-request writer-generation admission.
 *
 * A request that targets a route declared `requiresCurrentProtocol` — or that
 * resolves on the generic procedure dispatch to a procedure whose scope is not
 * `session:read` — must carry {@link REMOTE_PROTOCOL_VERSION_HEADER} with the
 * EXACT current generation string. Anything else is refused with the same
 * typed 409 before any effect: missing, old, future, malformed, and duplicate
 * header lines (Node joins duplicates into one comma-separated value, which
 * fails the exact compare) are all indistinguishable to the caller. The
 * comparison is exact-match, never a range or numeric check, mirroring the
 * fail-closed style of `requireRemoteCommandId`.
 *
 * Callers MUST invoke this only after bearer authentication and scope
 * authorization (so an unauthorized request still surfaces 401/403 and no
 * enumeration oracle appears) and before the audit line, payload parsing, or
 * any handler/mutation effect. Auth-free routes and read-class POSTs (pairing
 * exchange, ticket mints) never consult this gate, so already-paired old
 * clients keep reads while their writer requests are refused.
 */
export function requireCurrentRemoteProtocolVersion(req: IncomingMessage): void {
  // Optional-chained on purpose: an absent header map (a degenerate mock or a
  // transport that lost its headers) presents nothing and is refused typed,
  // never crashed into a generic 500.
  const presented = req.headers?.[REMOTE_PROTOCOL_VERSION_HEADER];
  if (Array.isArray(presented) || presented !== REMOTE_PROTOCOL_VERSION_HEADER_VALUE) {
    throw new RemoteHttpError(
      "protocol_version_mismatch",
      "Remote protocol version mismatch: this operation requires the client's current protocol generation, and the request was not performed. Update the Poracode client and retry.",
      409,
    );
  }
}
