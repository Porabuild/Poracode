import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { safeStorage } from "electron";
import { writeFileAtomic } from "@/shared/atomicFile";

const SAFE_STORAGE_KEY_FILE = "secret-key.safe";

function keyFilePath(baseDir: string): string {
  return join(baseDir, SAFE_STORAGE_KEY_FILE);
}

function isValidKey(value: string): boolean {
  return Buffer.from(value, "base64").length === 32;
}

export function readOrCreateSafeStorageSecretKey(baseDir: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is not available.");
  }

  const path = keyFilePath(baseDir);
  try {
    const encrypted = Buffer.from(readFileSync(path, "utf8"), "base64");
    const key = safeStorage.decryptString(encrypted);
    if (isValidKey(key)) return key;
  } catch {
    // Either the key file does not exist yet (first launch) or the OS-level
    // safeStorage key is no longer available (e.g. credential reset, reinstall,
    // different user). Fall through to regenerate; anything sealed with the
    // prior key is unrecoverable regardless.
  }

  const key = randomBytes(32).toString("base64");
  const encrypted = safeStorage.encryptString(key).toString("base64");
  writeFileAtomic(path, encrypted, { encoding: "utf8", mode: 0o600 });
  return key;
}
