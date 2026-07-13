import type { OAuthToken } from "@poracode/agents-usage";

/**
 * z.ai / Zhipu GLM Coding Plan credential resolution from the environment,
 * mirroring CodexBar: the API key comes from `Z_AI_API_KEY`, with optional host
 * overrides via `Z_AI_API_HOST` (e.g. BigModel CN) or `Z_AI_QUOTA_URL` (a full
 * quota-endpoint override). Carried on the token's `raw` bag so the pure
 * collector can resolve the endpoint without touching `process.env`. Users who
 * have no env key instead paste one into the in-app sign-in. Secrets never log.
 */

export const ZAI_API_KEY_ENV = "Z_AI_API_KEY";
export const ZAI_API_HOST_ENV = "Z_AI_API_HOST";
export const ZAI_QUOTA_URL_ENV = "Z_AI_QUOTA_URL";

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

/** Pure: build the z.ai usage token from an environment bag (testable). */
export function parseZaiEnv(env: Record<string, string | undefined>): OAuthToken | undefined {
  const accessToken = cleaned(env[ZAI_API_KEY_ENV]);
  if (!accessToken) return undefined;
  const quotaUrl = cleaned(env[ZAI_QUOTA_URL_ENV]);
  const apiHost = cleaned(env[ZAI_API_HOST_ENV]);
  const raw: Record<string, unknown> = {};
  if (quotaUrl) raw.quotaUrl = quotaUrl;
  if (apiHost) raw.apiHost = apiHost;
  return Object.keys(raw).length > 0 ? { accessToken, raw } : { accessToken };
}

export function resolveZaiToken(): Promise<OAuthToken | undefined> {
  return Promise.resolve(parseZaiEnv(process.env));
}
