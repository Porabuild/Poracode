import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Relay channel binding (plan item 4.8, finding T7).
 *
 * The relay is an acknowledged man-in-the-middle: it terminates visitor
 * HTTP/WebSocket and can read everything that crosses it (relayProtocol.ts).
 * That admission makes one hardening property achievable without end-to-end
 * encryption: a credential MINTED through the relay never has to exist in raw
 * form on the wire at all. The host adapter rewrites the token-exchange
 * response, replacing the server's raw access token with a relay-bound
 * credential — the raw token encrypted under a key derived from the relay
 * enrollment (server id + registration secret). Only this host adapter can
 * unwrap it, and it does so only for traffic that arrives through the relay
 * tunnel, restoring the raw token on the final loopback hop to the server.
 *
 * The resulting property:
 *
 * - A bearer captured from a relayed client (relay logs, a stolen token store,
 *   any leak off the host) is a bound credential. Presented DIRECTLY to the
 *   server's own listener it fails the existing bearer check — it is not a
 *   stored token — so replaying a relay-issued bearer off-relay is dead.
 * - The direct-connection path never gains the unwrapping key: it is derived
 *   from the relay enrollment secret, which exists only on the host and (by
 *   the acknowledged-MITM property) on the relay.
 * - A relay compromise remains session takeover at token scope — unchanged and
 *   documented (REMOTE_ARCHITECTURE.md); the relay always saw raw bearers
 *   before this mechanism existed, so binding is a strict reduction.
 *
 * Binding horizon: the key is derived from the ENROLLMENT (server id +
 * registration secret), not from one control-socket connection. A per-connection
 * key would invalidate every paired client whenever the relay connection
 * blipped or the host restarted, for no additional protection — a captured
 * bound credential is already worthless off-relay, and whoever can capture it
 * can equally replay it THROUGH the relay. Changing the enrollment secret (or
 * the server id) invalidates outstanding bound credentials; those clients
 * re-pair, exactly like a revoked session.
 */

/** Versioned credential prefix: failure to parse is a format change, not an
 * auth failure — unparsable bearers pass through untouched and the server's
 * own bearer check answers them. */
export const RELAY_BOUND_TOKEN_PREFIX = "lcb1_";

const BINDING_HKDF_INFO = "poracode relay channel binding v1";
const BINDING_AAD_PREFIX = "poracode-relay-bound-access-token:v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface RelayChannelBinding {
  /** Encrypts a raw server access token into its relay-bound credential. */
  bind(accessToken: string): string;
  /** Decrypts a presented credential back to the raw server access token, or
   * returns null for anything that is not a bound credential of THIS relay
   * enrollment (foreign tokens, garbage, other servers' bindings). */
  unbind(presented: string): string | null;
}

/** HKDF-SHA256 over the relay enrollment material. Exported for tests; the
 * binding key never leaves the host adapter. */
export function deriveRelayChannelBindingKey(serverId: string, relaySecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", relaySecret, serverId, BINDING_HKDF_INFO, KEY_BYTES));
}

function bindingAad(serverId: string): Buffer {
  return Buffer.from(`${BINDING_AAD_PREFIX}:${serverId}`, "utf8");
}

function encodeToken(iv: Buffer, ciphertext: Buffer): string {
  return `${RELAY_BOUND_TOKEN_PREFIX}${Buffer.concat([iv, ciphertext]).toString("base64url")}`;
}

export function makeRelayChannelBinding(input: {
  readonly serverId: string;
  readonly relaySecret: string;
}): RelayChannelBinding {
  const key = deriveRelayChannelBindingKey(input.serverId, input.relaySecret);
  const aad = bindingAad(input.serverId);
  return {
    bind(accessToken: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
      return encodeToken(iv, Buffer.concat([ciphertext, cipher.getAuthTag()]));
    },
    unbind(presented: string): string | null {
      if (!presented.startsWith(RELAY_BOUND_TOKEN_PREFIX)) return null;
      const encoded = presented.slice(RELAY_BOUND_TOKEN_PREFIX.length);
      let payload: Buffer;
      try {
        payload = Buffer.from(encoded, "base64url");
      } catch {
        return null;
      }
      // IV + at least one ciphertext byte + 16-byte GCM tag.
      if (payload.length < IV_BYTES + 1 + 16) return null;
      const iv = payload.subarray(0, IV_BYTES);
      const tag = payload.subarray(payload.length - 16);
      const ciphertext = payload.subarray(IV_BYTES, payload.length - 16);
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAAD(aad);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        // Wrong enrollment, truncated/tampered payload: not a credential of
        // this channel. The caller passes the bearer through unchanged and the
        // server's own auth path rejects it.
        return null;
      }
    },
  };
}

/** Whether a presented credential carries the bound format at all. Purely
 * textual (no key material): used to decide whether a rewrite applies without
 * spending a decryption on every ordinary bearer. */
export function isRelayBoundCredential(presented: string): boolean {
  return presented.startsWith(RELAY_BOUND_TOKEN_PREFIX);
}
