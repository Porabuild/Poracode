import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { safeStorage } from "electron";
import { writeFileAtomic } from "@/shared/atomicFile";
import { captureMainException } from "./diagnostics/sentry";

const SAFE_STORAGE_KEY_FILE = "secret-key.safe";

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

function reportKeyRecovery(reason: "decrypt_failed" | "invalid_key"): void {
  captureMainException(new Error(`Stored safeStorage key recovery: ${reason}.`), {
    "poracode.feature_area": "credential-storage",
  });
}

function throwSecretStorageError(message: string): never {
  throw new Error(message);
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
  let encryptionAvailable: boolean;
  try {
    encryptionAvailable = safeStorage.isEncryptionAvailable();
    if (
      encryptionAvailable &&
      platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text"
    ) {
      encryptionAvailable = false;
    }
  } catch {
    throw new Error("Unable to inspect OS-backed secret storage.");
  }
  if (!encryptionAvailable) {
    console.warn(
      "[credential-storage] secure OS encryption is unavailable; credentials are session-only.",
    );
    return randomBytes(32).toString("base64");
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
    reportKeyRecovery("invalid_key");
  } catch {
    // Credential resets and OS keychain changes make the old key unrecoverable.
    // Report the typed recovery without including the key file path or contents,
    // then rotate to a fresh OS-encrypted key so the app remains usable.
    reportKeyRecovery("decrypt_failed");
  }

  return createPersistentKey(path);
}
