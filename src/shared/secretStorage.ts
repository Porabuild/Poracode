import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { SECRET_PREFIX, isEncryptedSecret } from "./secretFormat";

// Re-exported so existing `@/shared/secretStorage` import sites stay stable;
// the prefix check itself is crypto-free (see `secretFormat.ts`).
export { isEncryptedSecret };

/**
 * Symmetric secret sealing shared by the main and supervisor processes. The key
 * is derived once in main from Electron `safeStorage` (see
 * `src/main/secretStorageKey.ts`) and handed to the supervisor over the
 * `PORACODE_SECRET_STORAGE_KEY` env var. Both processes call
 * `configureSecretStorageKey` at boot, then seal/unseal with the same AES-256-GCM
 * scheme — so a value encrypted in one process decrypts in the other without any
 * plaintext crossing the IPC channel. Pure `node:crypto`; no Electron import, so
 * it runs in either process (and under vitest with an ephemeral fallback key).
 */

let configuredSecretKey: Buffer | undefined;
let testFallbackSecretKey: Buffer | undefined;

export function configureSecretStorageKey(rawKey: string | undefined): void {
  if (!rawKey) return;
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("Invalid Poracode secret key.");
  }
  configuredSecretKey = key;
}

function readSecretKey(): Buffer {
  if (configuredSecretKey) return configuredSecretKey;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    testFallbackSecretKey ??= randomBytes(32);
    return testFallbackSecretKey;
  }
  throw new Error("Poracode secret storage key is not initialized.");
}

export function encryptSecret(_baseDir: string, value: string): string {
  if (isEncryptedSecret(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readSecretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(_baseDir: string, value: string): string {
  if (!isEncryptedSecret(value)) return value;
  const [ivPart, tagPart, ciphertextPart] = value.slice(SECRET_PREFIX.length).split(":");
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Invalid encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", readSecretKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
