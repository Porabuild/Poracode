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

export function readOrCreateHeadlessSecretKey(baseDir: string): string {
  const fromEnv = process.env.LIGHTCODE_SECRET_STORAGE_KEY?.trim();
  if (fromEnv) {
    if (!isValidKey(fromEnv)) {
      throw new Error("LIGHTCODE_SECRET_STORAGE_KEY must be a base64-encoded 32-byte key.");
    }
    return fromEnv;
  }

  const path = keyFilePath(baseDir);
  if (existsSync(path)) {
    try {
      const existing = readFileSync(path, "utf8").trim();
      if (isValidKey(existing)) return existing;
    } catch {
      // Unreadable/corrupt key file — regenerate below. Anything sealed with
      // the prior key is unrecoverable regardless.
    }
  }

  const key = randomBytes(32).toString("base64");
  writeFileAtomic(path, key, { encoding: "utf8", mode: 0o600 });
  return key;
}

const RELAY_SECRET_FILE = "relay-secret";

/**
 * Secret that proves ownership of this server's relay id (its desktopId) to a
 * relay. Persisted so the id stays claimable across restarts; env-overridable
 * via `LIGHTCODE_REMOTE_RELAY_SECRET`. Unlike the storage key this need not be
 * 32 bytes — it's an opaque bearer string between the server and the relay.
 */
export function readOrCreateRelaySecret(baseDir: string): string {
  const fromEnv = process.env.LIGHTCODE_REMOTE_RELAY_SECRET?.trim();
  if (fromEnv) return fromEnv;

  const path = join(baseDir, RELAY_SECRET_FILE);
  if (existsSync(path)) {
    try {
      const existing = readFileSync(path, "utf8").trim();
      if (existing) return existing;
    } catch {
      // regenerate below
    }
  }
  const secret = randomBytes(32).toString("base64url");
  writeFileAtomic(path, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}
