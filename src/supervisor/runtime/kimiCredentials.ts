import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OAuthToken } from "@poracode/agents-usage";
import { nativeKimiHomePath, nativeKimiOAuthCredentialPath } from "../agents/kimi/detection";

/**
 * Kimi For Coding credential resolution, mirroring CodexBar: an explicit API
 * key from `KIMI_CODE_API_KEY` wins (with an optional `KIMI_CODE_BASE_URL`
 * endpoint override carried on the token's `raw` bag), else the Kimi Code
 * CLI's access token is reused read-only from
 * `~/.kimi-code/credentials/kimi-code.json` (honoring `KIMI_CODE_HOME`). A
 * CLI credential is never combined with an endpoint override — a custom base
 * URL means a test proxy, and forwarding the CLI token there would leak it.
 * The refresh token is never used and the credential file never rewritten.
 * Users who have neither paste a key into the in-app sign-in. Secrets never log.
 */

export const KIMI_API_KEY_ENV = "KIMI_CODE_API_KEY";
export const KIMI_BASE_URL_ENV = "KIMI_CODE_BASE_URL";

/** Sent alongside a CLI-sourced token, matching the official client. */
const KIMI_CLI_PLATFORM = "kimi_code_cli";

/** Trim surrounding whitespace and a single layer of wrapping quotes. */
function cleaned(raw: string | undefined): string | undefined {
  let value = raw?.trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

/** Pure: build the Kimi usage token from an explicit API key in the env. */
export function parseKimiEnv(env: Record<string, string | undefined>): OAuthToken | undefined {
  const accessToken = cleaned(env[KIMI_API_KEY_ENV]);
  if (!accessToken) return undefined;
  const baseUrl = cleaned(env[KIMI_BASE_URL_ENV]);
  return baseUrl ? { accessToken, raw: { baseUrl } } : { accessToken };
}

/** `expires_at` arrives as epoch seconds (or ms); normalize to epoch ms. */
function expiryEpochMs(value: unknown): number | undefined {
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

/**
 * Pure: parse the CLI credential file. Returns a token only while the access
 * token is fresh (CodexBar's rule: at least 60s of validity left) — this
 * resolver never refreshes, so a stale token must read as signed-out rather
 * than produce confusing 401s.
 */
export function parseKimiCliCredential(content: string, nowMs: number): OAuthToken | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const rawToken = record["access_token"] ?? record["accessToken"];
  const accessToken = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!accessToken) return undefined;
  const expiresAt = expiryEpochMs(record["expires_at"] ?? record["expiresAt"]);
  if (expiresAt === undefined || expiresAt <= nowMs + 60_000) return undefined;
  return { accessToken, expiresAt };
}

/** The CLI's stable device id, when it exists. Read-only: never created here. */
async function readDeviceId(): Promise<string | undefined> {
  try {
    const content = await readFile(join(nativeKimiHomePath(), "device_id"), "utf8");
    return cleaned(content);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the Kimi usage credential: explicit API key first, then the Kimi
 * Code CLI's fresh access token (with the device identity headers the official
 * client sends). Returns undefined when neither exists so the collector reports
 * `auth-missing` and the card can offer the API-key sign-in.
 */
export async function resolveKimiToken(): Promise<OAuthToken | undefined> {
  const fromEnv = parseKimiEnv(process.env);
  if (fromEnv) return fromEnv;
  // An endpoint override without an explicit key disables CLI credential reuse.
  if (cleaned(process.env[KIMI_BASE_URL_ENV])) return undefined;

  let content: string;
  try {
    content = await readFile(nativeKimiOAuthCredentialPath(), "utf8");
  } catch {
    return undefined;
  }
  const token = parseKimiCliCredential(content, Date.now());
  if (!token) return undefined;

  const identityHeaders: Record<string, string> = { "X-Msh-Platform": KIMI_CLI_PLATFORM };
  const deviceId = await readDeviceId();
  if (deviceId) identityHeaders["X-Msh-Device-Id"] = deviceId;
  return { ...token, raw: { identityHeaders } };
}
