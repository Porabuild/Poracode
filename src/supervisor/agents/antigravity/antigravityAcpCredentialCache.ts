import type { CredentialStore } from "@poracode/agents-usage";
import { coalesceByKey } from "@/shared/coalesce";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  parseAntigravityAcpCredentials,
  readAntigravityAcpKeychainFingerprint,
  resolveAntigravityAcpCredentials,
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

function parseSavedCredentials(
  saved: string,
  fingerprint: string,
): AntigravityAcpCredentials | undefined {
  try {
    const record: unknown = JSON.parse(saved);
    if (
      !record ||
      typeof record !== "object" ||
      !("keychainFingerprint" in record) ||
      record.keychainFingerprint !== fingerprint
    ) {
      return undefined;
    }
    const credentials = parseAntigravityAcpCredentials(saved);
    return credentials ? { ...credentials, keychainFingerprint: fingerprint } : undefined;
  } catch {
    return undefined;
  }
}

export interface AntigravityAcpCredentialCache {
  resolve(): Promise<AntigravityAcpCredentials | undefined>;
  invalidate(rejected: AntigravityAcpCredentials): Promise<void>;
}

/** Reuse granted credentials across refreshes and restarts without rereading the password. */
export function createAntigravityAcpCredentialCache(
  store: SecretStore,
  resolveCredentials: ResolveCredentials = resolveAntigravityAcpCredentials,
  readKeychainFingerprint: () => Promise<
    string | undefined
  > = readAntigravityAcpKeychainFingerprint,
): AntigravityAcpCredentialCache {
  let cached: AntigravityAcpCredentials | undefined;
  let readPersisted = true;
  let invalidation: Promise<void> | undefined;
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
          readPersisted = false;
          const fingerprint = await readKeychainFingerprint().catch(() => undefined);
          if (fingerprint) {
            const saved = await store
              .getSecret(PROVIDER_ID, CREDENTIALS_SECRET_KEY)
              .catch(() => undefined);
            if (saved) cached = parseSavedCredentials(saved, fingerprint);
          }
          if (cached) return cached;
        }

        const credentials = await resolveCredentials();
        if (credentials) {
          // Only Keychain grants need durable import. File/WSL credentials must
          // still be reread after restart, including account switches and logout.
          if (credentials.keychainFingerprint) {
            await persist(
              JSON.stringify({
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                refresh_token: credentials.refreshToken,
                token_uri: ANTIGRAVITY_GOOGLE_TOKEN_URI,
                keychainFingerprint: credentials.keychainFingerprint,
              }),
            );
          }
          cached = credentials;
        }
        return credentials;
      }),
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
