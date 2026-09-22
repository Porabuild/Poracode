/** Secret redaction for every printed byte of the N-1 qualification gate. */

const PAIRING_URL_PATTERN = /(pairingUrl["']?\s*[:=]\s*["']?)(https?:\/\/[^\s"',}\]]+)/gi;
const QUERY_SECRET_PATTERN = /([?&#](?:token|ticket|credential)=)[^\s&"',}\]]+/gi;
const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
const JSON_SECRET_PATTERN =
  /("(?:accessToken|refreshToken|token|credential|password|api[_-]?key)"\s*:\s*")([^"]+)(")/gi;

/** Redact pairing URLs, query-token values, bearer tokens, and token fields. */
export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(PAIRING_URL_PATTERN, "$1[redacted-pairing-url]")
    .replace(QUERY_SECRET_PATTERN, "$1[redacted]")
    .replace(BEARER_PATTERN, "$1[redacted]")
    .replace(JSON_SECRET_PATTERN, "$1[redacted]$3");
}
