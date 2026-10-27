import type { CredentialStore } from "@poracode/agents-usage";
import { coalesceByKey } from "@/shared/coalesce";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  parseAntigravityAcpCredentials,
  readAntigravityAcpKeychainFingerprint,
  resolveAntigravityAcpCredentials,
  resolveAntigravityAcpFileCredentials,
  type AntigravityAcpCredentials,
} from "./antigravityAcpCredentials";

/**
 * Versioned, additive slot in the existing encrypted provider secret store.
 * Older stores have no entry and remain valid; the shared secret format and
 * usage snapshot cache need no version bump. The payload uses the ACP artifact
 * format, including the validated token destination, plus the source fingerprint.
 */
const CREDENTIALS_SECRET_KEY = "acp-credentials-v1";
const PROVIDER_ID = "antigravity";

type SecretStore = Pick<CredentialStore, "getSecret" | "setSecret">;
type ResolveCredentials = () => Promise<AntigravityAcpCredentials | undefined>;

function serializeCredentials(credentials: AntigravityAcpCredentials, fingerprint: string): string {
  return JSON.stringify({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    token_uri: ANTIGRAVITY_GOOGLE_TOKEN_URI,
    keychainFingerprint: fingerprint,
  });
}

/**
 * Parse a saved grant without comparing its fingerprint to the live item.
 * `agy_acp_server` delete+adds its Keychain item on every start: each
 * recreation resets the item's dates (a new fingerprint) and its ACL (the
 * user's earlier "Always Allow" for the reader is gone), while the stored
 * token usually stays the same. Binding reuse to the old fingerprint would
 * therefore discard the grant and re-prompt on every launch; instead the
 * grant is reused provisionally while the item still exists, `confirm`
 * rebinds it after the credentials succeed against the API, and an API
 * rejection invalidates it so the next refresh re-imports from the Keychain.
 */
function parseSavedCredentials(saved: string): AntigravityAcpCredentials | undefined {
  try {
    const record: unknown = JSON.parse(saved);
    if (!record || typeof record !== "object" || !("keychainFingerprint" in record)) {
      return undefined;
    }
    const fingerprint = record.keychainFingerprint;
    if (typeof fingerprint !== "string" || !fingerprint) return undefined;
    const credentials = parseAntigravityAcpCredentials(saved);
    return credentials ? { ...credentials, keychainFingerprint: fingerprint } : undefined;
  } catch {
    return undefined;
  }
}

export interface AntigravityAcpCredentialCache {
  resolve(): Promise<AntigravityAcpCredentials | undefined>;
  /** Bind accepted Keychain credentials to the live item and persist that binding. */
  confirm(accepted: AntigravityAcpCredentials): Promise<void>;
  invalidate(rejected: AntigravityAcpCredentials): Promise<void>;
}

/** Reuse granted credentials across refreshes and restarts without rereading the password. */
export function createAntigravityAcpCredentialCache(
  store: SecretStore,
  resolveCredentials: ResolveCredentials = resolveAntigravityAcpCredentials,
  readKeychainFingerprint: () => Promise<
    string | undefined
  > = readAntigravityAcpKeychainFingerprint,
  resolveFileCredentials: ResolveCredentials = resolveAntigravityAcpFileCredentials,
): AntigravityAcpCredentialCache {
  let cached: AntigravityAcpCredentials | undefined;
  let readPersisted = true;
  let invalidation: Promise<void> | undefined;
  // Credential objects this cache knows came from the Keychain item (restored
  // grants and fresh Keychain reads), as opposed to the file/WSL sources that
  // must never be persisted as a Keychain grant.
  const keychainSourced = new WeakSet<AntigravityAcpCredentials>();
  const resolutions = new Map<string, Promise<AntigravityAcpCredentials | undefined>>();

  async function persist(value: string): Promise<void> {
    try {
      await store.setSecret?.(PROVIDER_ID, CREDENTIALS_SECRET_KEY, value);
    } catch {
      // Keep the in-memory cache useful if encrypted storage is unavailable.
    }
  }

  return {
    resolve: () =>
      coalesceByKey(resolutions, PROVIDER_ID, async () => {
        if (cached) return cached;
        // A refresh racing an auth failure must wait until the rejected durable
        // value is cleared, rather than resurrecting it or overwriting its clear.
        await invalidation;
        if (readPersisted) {
          // The attribute read doubles as an existence check: a removed item
          // (logout) must not restore the grant. Its value is deliberately
          // not compared to the saved fingerprint — the owning server
          // recreates the item on every start (see parseSavedCredentials).
          const saved = await store
            .getSecret(PROVIDER_ID, CREDENTIALS_SECRET_KEY)
            .catch(() => undefined);
          const grant = saved ? parseSavedCredentials(saved) : undefined;
          if (grant) {
            const fingerprint = await readKeychainFingerprint().catch(() => undefined);
            if (!fingerprint) {
              // The server can be between delete/add while starting. Keep the
              // saved grant eligible for the next metadata check instead of
              // requesting the recreated item's password and prompting again.
              // A deliberate move to file storage must still remain usable.
              cached = await resolveFileCredentials();
              return cached;
            }
            cached = grant;
            keychainSourced.add(cached);
          }
          readPersisted = false;
          if (cached) return cached;
        }

        const credentials = await resolveCredentials();
        if (credentials) {
          if (credentials.fromKeychain || credentials.keychainFingerprint) {
            keychainSourced.add(credentials);
          }
          // Only Keychain grants need durable import. File/WSL credentials must
          // still be reread after restart, including account switches and logout.
          if (credentials.keychainFingerprint) {
            await persist(serializeCredentials(credentials, credentials.keychainFingerprint));
          }
          cached = credentials;
        }
        return credentials;
      }),
    confirm: async (accepted) => {
      // Only the live cached object may adopt a new binding; a late success
      // for superseded credentials must not rebind their replacement.
      if (cached !== accepted || !keychainSourced.has(accepted)) return;
      const fingerprint = await readKeychainFingerprint().catch(() => undefined);
      if (!fingerprint || cached !== accepted) return;
      if (accepted.keychainFingerprint === fingerprint) return;
      const adopted = { ...accepted, keychainFingerprint: fingerprint };
      keychainSourced.add(adopted);
      cached = adopted;
      await persist(serializeCredentials(adopted, fingerprint));
    },
    invalidate: (rejected) => {
      // A late response using an older credential must not clear its replacement.
      if (cached !== rejected) return Promise.resolve();
      cached = undefined;
      readPersisted = false;
      // The store has no delete operation. Encrypted JSON null is a cache miss
      // on restart and removes the rejected token without changing its API.
      invalidation = persist("null");
      return invalidation;
    },
  };
}

const caches = new WeakMap<CredentialStore, AntigravityAcpCredentialCache>();

/** Keep credentials scoped to the host's secret store, including its data root. */
export function antigravityAcpCredentialCache(
  store: CredentialStore,
): AntigravityAcpCredentialCache {
  let cache = caches.get(store);
  if (!cache) {
    cache = createAntigravityAcpCredentialCache(store);
    caches.set(store, cache);
  }
  return cache;
}
