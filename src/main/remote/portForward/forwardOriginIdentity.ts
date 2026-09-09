import { deriveForwardOwner, ForwardOriginPolicy } from "./forwardOrigin";

/**
 * The configured browser-forward origin identity of one host: the validated
 * HTTPS base origin plus the 24-hex owner label derived from the host's
 * persistent origin secret and its server id. Every child origin this host
 * serves is `originFor(ownerId, forwardId)` under `baseUrl`; a different
 * secret or server id derives a different owner and can never claim these
 * hostnames.
 */
export interface ForwardOriginIdentity {
  /** Validated HTTPS base origin (no path/query/credentials), e.g. `https://apps.example.test`. */
  readonly baseUrl: string;
  /** 24-hex owner label (`deriveForwardOwner(originSecret, serverId)`). */
  readonly ownerId: string;
}

/** Availability facts for the browser-forward capability descriptor the
 * coordinator's protocol/codegen integration wires up. */
export interface ForwardOriginAvailability {
  /** Whether isolated browser-origin forwarding is configured on this host. */
  readonly available: boolean;
  readonly baseUrl: string | null;
  readonly ownerId: string | null;
}

export const FORWARD_ORIGIN_UNAVAILABLE: ForwardOriginAvailability = {
  available: false,
  baseUrl: null,
  ownerId: null,
};

/**
 * Validates a configured forward base URL and derives the host's owner label.
 * Returns `null` when no base URL is configured (browser forwarding stays
 * unavailable while raw TCP forwarding keeps working); throws on a malformed
 * explicit configuration or unusable credentials, so a bad deployment fails
 * loudly instead of silently losing browser forwarding.
 */
export function createForwardOriginIdentity(input: {
  readonly baseUrl: string | undefined;
  readonly originSecret: string;
  readonly serverId: string;
}): ForwardOriginIdentity | null {
  const raw = input.baseUrl?.trim();
  if (!raw) return null;
  const policy = new ForwardOriginPolicy(raw);
  const ownerId = deriveForwardOwner(input.originSecret, input.serverId);
  return { baseUrl: policy.baseUrl, ownerId };
}
