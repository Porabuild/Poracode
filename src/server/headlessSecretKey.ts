import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";

/**
 * Secret-storage key for the headless server.
 *
 * The desktop derives its key from Electron `safeStorage`
 * (`src/main/secretStorageKey.ts`), which is backed by the OS keychain. A
 * headless server generally has no keychain, so the key is persisted to a
 * file in the data dir instead (mode 0600). This is strictly weaker than the
 * desktop's OS-sealed key — anyone who can read the data dir can read the key —
 * but it matches the server's trust model: the SQLite DB, agent credentials and
 * project files already live in that same dir under the same filesystem
 * permissions.
 *
 * Precedence:
 *   1. `LIGHTCODE_SECRET_STORAGE_KEY` env (base64, 32 bytes) — lets an operator
 *      inject a key from a real secret manager and keep it off disk.
 *   2. the persisted key file.
 *   3. a freshly generated key, persisted for next boot.
 *
 * Sealed secrets are per-install: rotating the key only invalidates previously
 * sealed values (re-auth required), it never corrupts the DB.
 */
const HEADLESS_KEY_FILE = "secret-key.headless";

function keyFilePath(baseDir: string): string {
  return join(baseDir, HEADLESS_KEY_FILE);
}

function isValidKey(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function readOrCreatePersistedSecret(
  path: string,
  options: {
    readonly fromEnv?: string | undefined;
    readonly validateEnv?: (value: string) => void;
    readonly isValid: (value: string) => boolean;
    readonly generate: () => string;
  },
): string {
  const { fromEnv } = options;
  if (fromEnv) {
    options.validateEnv?.(fromEnv);
    return fromEnv;
  }

  if (existsSync(path)) {
    try {
      const existing = readFileSync(path, "utf8").trim();
      if (options.isValid(existing)) return existing;
    } catch {
      // Unreadable/corrupt secret file — regenerate below. Anything sealed with
      // the prior secret is unrecoverable regardless.
    }
  }

  const secret = options.generate();
  writeFileAtomic(path, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

export function readOrCreateHeadlessSecretKey(baseDir: string): string {
  return readOrCreatePersistedSecret(keyFilePath(baseDir), {
    fromEnv: process.env.LIGHTCODE_SECRET_STORAGE_KEY?.trim(),
    validateEnv: (value) => {
      if (!isValidKey(value)) {
        throw new Error("LIGHTCODE_SECRET_STORAGE_KEY must be a base64-encoded 32-byte key.");
      }
    },
    isValid: isValidKey,
    generate: () => randomBytes(32).toString("base64"),
  });
}

const RELAY_SECRET_FILE = "relay-secret";

/**
 * Secret that proves ownership of this server's relay id (its desktopId) to a
 * relay. Persisted so the id stays claimable across restarts; env-overridable
 * via `LIGHTCODE_REMOTE_RELAY_SECRET`. Unlike the storage key this need not be
 * 32 bytes — it's an opaque bearer string between the server and the relay.
 */
export function readOrCreateRelaySecret(baseDir: string): string {
  return readOrCreatePersistedSecret(join(baseDir, RELAY_SECRET_FILE), {
    fromEnv: process.env.LIGHTCODE_REMOTE_RELAY_SECRET?.trim(),
    isValid: (value) => value.length > 0,
    generate: () => randomBytes(32).toString("base64url"),
  });
}
