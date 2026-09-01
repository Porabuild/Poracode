import type { OAuthToken } from "@poracode/agents-usage";

/**
 * Qoder credential resolution from the environment.
 *
 * Sourced from `QODER_PERSONAL_ACCESS_TOKEN` (standard Qoder PAT env var) or `QODER_API_KEY`,
 * with optional host overrides via `QODER_BASE_URL` or `QODER_ENDPOINT`.
 * Carried on the token's `raw` bag so the pure collector can resolve the endpoint
 * without touching `process.env`.
 *
 * Browser session cookies or in-app pasted tokens are stored securely in safeStorage
 * and decrypted on demand via `getSecret`. Secrets are never logged.
 */

export const QODER_PERSONAL_ACCESS_TOKEN_ENV = "QODER_PERSONAL_ACCESS_TOKEN";
export const QODER_API_KEY_ENV = "QODER_API_KEY";
export const QODER_BASE_URL_ENV = "QODER_BASE_URL";
export const QODER_ENDPOINT_ENV = "QODER_ENDPOINT";

const TOKEN_ENV_KEYS = [QODER_PERSONAL_ACCESS_TOKEN_ENV, QODER_API_KEY_ENV] as const;

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

/** Pure: build the Qoder usage token from an environment bag. */
export function parseQoderUsageEnv(
  env: Record<string, string | undefined>,
): OAuthToken | undefined {
  let accessToken: string | undefined;
  for (const key of TOKEN_ENV_KEYS) {
    accessToken = cleaned(env[key]);
    if (accessToken) break;
  }
  if (!accessToken) return undefined;

  const baseUrl = cleaned(env[QODER_BASE_URL_ENV]);
  const endpoint = cleaned(env[QODER_ENDPOINT_ENV]);

  const raw: Record<string, unknown> = {};
  if (baseUrl) raw.baseUrl = baseUrl;
  if (endpoint) raw.endpoint = endpoint;

  return Object.keys(raw).length > 0 ? { accessToken, raw } : { accessToken };
}

export function resolveQoderToken(): Promise<OAuthToken | undefined> {
  return Promise.resolve(parseQoderUsageEnv(process.env));
}
