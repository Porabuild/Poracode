import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { safeStorage } from "electron";
import { writeFileAtomic } from "@/shared/atomicFile";
import { safeStorageHealth } from "./safeStorageHealth";

const SAFE_STORAGE_KEY_FILE = "secret-key.safe";
let sessionOnlyKey: string | undefined;

function keyFilePath(baseDir: string): string {
  return join(baseDir, SAFE_STORAGE_KEY_FILE);
}

function isValidKey(value: string): boolean {
  return Buffer.from(value, "base64").length === 32;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
}

function throwSecretStorageError(message: string): never {
  throw new Error(message);
}

/**
 * Loud refusal instead of silent rotation (Gate 2.5 S5.2). The stored key
 * could not be decrypted with this machine's current OS secret storage, so
 * every credential sealed with it is currently ununlockable. Rotating here
 * would invalidate ALL sealed credentials as a silent side effect of a
 * failed read; instead the preserved key file keeps every sealed value
 * recoverable and startup fails with the disclosure and the explicit
 * remedies. The file name is disclosed, never its contents.
 */
export class SafeStorageKeyUnavailableError extends Error {
  readonly code = "SAFE_STORAGE_KEY_UNAVAILABLE";

  constructor(
    readonly reason: "decrypt_failed" | "invalid_key",
    keyFileName: string,
  ) {
    super(
      `The stored Poracode credential key (${keyFileName}) could not be decrypted with this ` +
        `machine's OS secret storage (${reason === "invalid_key" ? "decrypted to invalid key material" : "decryption failed"}). ` +
        "Nothing was rotated, deleted or replaced. Stored provider sign-ins and other sealed " +
        "secrets encrypted with the previous key can no longer be unlocked by this " +
        "installation until the original OS keychain entry is restored. To recover: restore " +
        "the original OS keychain entry (keychain migration, reset or profile recreation " +
        "causes this) and start Poracode again. To start over deliberately: quit Poracode, " +
        `remove the preserved ${keyFileName} file from this profile's data directory, then ` +
        "start Poracode and sign in again — sealed values from the previous key must be " +
        "re-entered on each surface.",
    );
    this.name = "SafeStorageKeyUnavailableError";
  }
}

function createPersistentKey(path: string): string {
  const key = randomBytes(32).toString("base64");
  let encrypted: Buffer;
  try {
    encrypted = safeStorage.encryptString(key);
  } catch {
    throw new Error("Unable to encrypt the Poracode secret storage key.");
  }
  try {
    writeFileAtomic(path, encrypted.toString("base64"), { encoding: "utf8", mode: 0o600 });
  } catch {
    throw new Error("Unable to persist the encrypted Poracode secret storage key.");
  }
  return key;
}

export function readOrCreateSafeStorageSecretKey(
  baseDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  // Availability is the once-per-launch latch (P3): the module logs the
  // session-only consequence exactly once when the latch is set.
  const health = safeStorageHealth(platform);
  if (health.kind === "inspection-failed") {
    throw new Error("Unable to inspect OS-backed secret storage.");
  }
  if (health.kind === "unavailable") {
    sessionOnlyKey ??= randomBytes(32).toString("base64");
    return sessionOnlyKey;
  }

  const path = keyFilePath(baseDir);
  let serialized: string;
  try {
    serialized = readFileSync(path, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return createPersistentKey(path);
    throwSecretStorageError("Unable to read the encrypted Poracode secret storage key.");
  }

  try {
    const encrypted = Buffer.from(serialized, "base64");
    const key = safeStorage.decryptString(encrypted);
    if (isValidKey(key)) return key;
    throw new SafeStorageKeyUnavailableError("invalid_key", SAFE_STORAGE_KEY_FILE);
  } catch (error) {
    // Credential resets and OS keychain changes make the old key undecryptable.
    // Refuse loudly instead of silently rotating: the preserved key file keeps
    // every sealed credential recoverable, and the typed error discloses what
    // is lost and the explicit remedies (restore the keychain entry, or make
    // the deliberate manual decision to start over).
    if (error instanceof SafeStorageKeyUnavailableError) throw error;
    throw new SafeStorageKeyUnavailableError("decrypt_failed", SAFE_STORAGE_KEY_FILE);
  }
}
