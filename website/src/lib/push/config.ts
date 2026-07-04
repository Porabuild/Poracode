/**
 * APNs gateway configuration, read from environment. Kept out of the request
 * path's import graph so a missing key surfaces as a 503 at request time rather
 * than crashing the route module at import (which would take down the whole
 * function). Call `getApnsConfig()` per request; it's cheap.
 */

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** PEM contents of the .p8 signing key, newlines normalized. */
  authKey: string;
  /** App bundle id, e.g. com.lightcodeapp.mobile. */
  topic: string;
  env: "production" | "sandbox";
  /** APNs host derived from `env`. */
  host: string;
}

/**
 * Env vars may carry literal `\n` escapes (common when a PEM is pasted into a
 * single-line env var in a dashboard). Normalize them back to real newlines and
 * strip surrounding quotes/whitespace.
 */
function normalizePem(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\r/g, "").replace(/\\n/g, "\n").trim();
}

/**
 * FCM (Firebase Cloud Messaging) HTTP v1 gateway configuration. Read from
 * environment per request, exactly like {@link getApnsConfig}, so a missing key
 * surfaces as a 503 at request time and an iOS-only (or Android-only) deployment
 * keeps working without the other provider's env being present.
 */
export interface FcmConfig {
  /** Firebase project id — the `{project}` in the v1 send URL. */
  projectId: string;
  /** Service-account client email — the OAuth2 JWT `iss`/`sub`. */
  clientEmail: string;
  /** PEM contents of the service-account private key, newlines normalized. */
  privateKey: string;
}

export function getFcmConfig(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  const privateKey = normalizePem(privateKeyRaw);
  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) return null;

  return { projectId, clientEmail, privateKey };
}

export function getApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const authKeyRaw = process.env.APNS_AUTH_KEY;
  const topic = process.env.APNS_TOPIC?.trim();

  if (!keyId || !teamId || !authKeyRaw || !topic) return null;

  const authKey = normalizePem(authKeyRaw);
  if (!authKey.includes("BEGIN") || !authKey.includes("PRIVATE KEY")) return null;

  const env: "production" | "sandbox" =
    process.env.APNS_ENV?.trim() === "sandbox" ? "sandbox" : "production";
  const host = env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";

  return { keyId, teamId, authKey, topic, env, host };
}
