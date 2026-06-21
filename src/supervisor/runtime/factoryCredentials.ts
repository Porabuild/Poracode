import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@lightcode/agents-usage";

/**
 * Factory / Droid credential resolution from the `droid` CLI's own auth store,
 * so usage works without a separate in-app login when the CLI is signed in.
 *
 * The current store is `~/.factory/auth.v2.file`, an AES-256-GCM envelope keyed
 * by `~/.factory/auth.v2.key`. Envelope format (matching the Factory CLI, as
 * implemented by openusage's host): three base64 parts `<iv>:<tag>:<ciphertext>`
 * with a 16-byte nonce + 16-byte tag; the key is a base64-encoded 32-byte AES key.
 * Older builds wrote a plaintext `~/.factory/auth.json`.
 *
 * This module is READ-ONLY: it never writes the CLI's files. We use the CLI's
 * (short-lived) access token while it is valid and never exchange its refresh
 * token — WorkOS rotates refresh tokens, so refreshing here would invalidate the
 * CLI's own session. Secrets are never logged.
 */

const AUTH_V2_FILE = "auth.v2.file";
const AUTH_V2_KEY = "auth.v2.key";
const AUTH_JSON = "auth.json";

function factoryDir(): string {
  const home = process.env.FACTORY_HOME?.trim();
  return home ? home : join(homedir(), ".factory");
}

/**
 * Decrypt a Factory `auth.v2.file` envelope. Throws on a malformed envelope, a
 * wrong-length key/iv/tag, or a GCM authentication failure.
 */
export function decryptFactoryAuthV2(envelope: string, keyB64: string): string {
  const parts = envelope.trim().split(":");
  if (parts.length !== 3) throw new Error("invalid AES-GCM envelope");
  const iv = Buffer.from(parts[0]!, "base64");
  const tag = Buffer.from(parts[1]!, "base64");
  const ciphertext = Buffer.from(parts[2]!, "base64");
  const key = Buffer.from(keyB64.trim(), "base64");
  if (key.length !== 32) throw new Error(`invalid AES-256 key length: ${key.length}`);
  if (iv.length !== 16) throw new Error(`invalid iv length: ${iv.length}`);
  if (tag.length !== 16) throw new Error(`invalid auth tag length: ${tag.length}`);

  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Encrypt to the same `auth.v2.file` envelope format. Not used to write the CLI
 * store (read-only), but kept so the decrypt format is round-trip testable.
 */
export function encryptFactoryAuthV2(plaintext: string, keyB64: string): string {
  const key = Buffer.from(keyB64.trim(), "base64");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

interface FactoryAuthBlob {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  tokens?: {
    access_token?: string;
    accessToken?: string;
    refresh_token?: string;
    refreshToken?: string;
  };
}

/**
 * Extract an access token (and refresh token, if present) from a decrypted or
 * plaintext Factory auth payload. Returns undefined when there is no access
 * token — the read-only collector needs one and never uses the refresh token.
 */
export function parseFactoryAuth(content: string): OAuthToken | undefined {
  let parsed: FactoryAuthBlob | undefined;
  try {
    parsed = JSON.parse(content) as FactoryAuthBlob;
  } catch {
    return undefined;
  }
  const accessToken =
    parsed?.access_token ??
    parsed?.accessToken ??
    parsed?.tokens?.access_token ??
    parsed?.tokens?.accessToken;
  if (typeof accessToken !== "string" || !accessToken) return undefined;
  const refreshToken =
    parsed?.refresh_token ??
    parsed?.refreshToken ??
    parsed?.tokens?.refresh_token ??
    parsed?.tokens?.refreshToken;
  return {
    accessToken,
    ...(typeof refreshToken === "string" && refreshToken ? { refreshToken } : {}),
  };
}

/**
 * Resolve the Factory access token from the local `droid` CLI store. Reads fresh
 * each call (the CLI rotates it). Returns undefined when the CLI isn't signed in
 * or the store can't be read/decrypted — the caller then falls back to the
 * in-app browser login. Native only (the browser login covers WSL/remote).
 */
export function resolveFactoryCliToken(): OAuthToken | undefined {
  const dir = factoryDir();

  const v2File = join(dir, AUTH_V2_FILE);
  const v2Key = join(dir, AUTH_V2_KEY);
  if (existsSync(v2File) && existsSync(v2Key)) {
    try {
      const decrypted = decryptFactoryAuthV2(
        readFileSync(v2File, "utf8"),
        readFileSync(v2Key, "utf8"),
      );
      const token = parseFactoryAuth(decrypted);
      if (token) return token;
    } catch {
      // fall through to the legacy plaintext store
    }
  }

  const authJson = join(dir, AUTH_JSON);
  if (existsSync(authJson)) {
    try {
      const token = parseFactoryAuth(readFileSync(authJson, "utf8"));
      if (token) return token;
    } catch {
      // not signed in via the CLI
    }
  }

  return undefined;
}
