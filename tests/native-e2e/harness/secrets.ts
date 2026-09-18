import { ACCESS_TOKEN_PREFIX, PAIRING_TOKEN_PREFIX, WEBSOCKET_TICKET_PREFIX } from "./constants.ts";

const SECRET_KEY_PATTERN =
  /^(accessToken|access_token|credential|ticket|token|pairingUrl|pairingToken|capability|authorization|cookie)$/i;

const SECRET_VALUE_PATTERN = new RegExp(
  `(${PAIRING_TOKEN_PREFIX}|${ACCESS_TOKEN_PREFIX}|${WEBSOCKET_TICKET_PREFIX})[A-Za-z0-9_-]+`,
  "g",
);

const FRAGMENT_SECRET_PATTERN = /([#&?](?:token|ticket|access_token|capability)=)[^&\s"']+/gi;
const QUERY_SECRET_PATTERN = /([?&](?:token|ticket|access_token|capability)=)[^&\s"']+/gi;
const AUTH_HEADER_PATTERN = /(authorization\s*[:=]\s*)(bearer|harness)\s+\S+/gi;
const COOKIE_HEADER_PATTERN = /(cookie\s*[:=]\s*)[^\r\n]+/gi;
const CONTROL_CAPABILITY_PATTERN =
  /(NATIVE_E2E_CONTROL_CAPABILITY|control capability)\s*[:=]\s*\S+/gi;

export function looksLikeSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactSecrets(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, "[redacted]")
    .replace(FRAGMENT_SECRET_PATTERN, "$1[redacted]")
    .replace(QUERY_SECRET_PATTERN, "$1[redacted]")
    .replace(AUTH_HEADER_PATTERN, "$1$2 [redacted]")
    .replace(COOKIE_HEADER_PATTERN, "$1[redacted]")
    .replace(CONTROL_CAPABILITY_PATTERN, "$1=[redacted]");
}

export function assertSecretFree(value: unknown, label = "payload"): void {
  const violations = collectSecretViolations(value);
  if (violations.length > 0) {
    throw new Error(`${label} leaked secret material: ${violations.join(", ")}`);
  }
}

export function collectSecretViolations(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    const matches = value.match(SECRET_VALUE_PATTERN) ?? [];
    const fragment = FRAGMENT_SECRET_PATTERN.test(value);
    FRAGMENT_SECRET_PATTERN.lastIndex = 0;
    const query = QUERY_SECRET_PATTERN.test(value);
    QUERY_SECRET_PATTERN.lastIndex = 0;
    const auth = AUTH_HEADER_PATTERN.test(value);
    AUTH_HEADER_PATTERN.lastIndex = 0;
    const found: string[] = [];
    if (matches.length > 0) found.push(`${path}=token-prefix`);
    if (fragment) found.push(`${path}=pairing-fragment`);
    if (query) found.push(`${path}=secret-query`);
    if (auth) found.push(`${path}=authorization`);
    return found;
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectSecretViolations(entry, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.entries(record).flatMap(([key, entry]) => {
      if (looksLikeSecretKey(key) && typeof entry === "string" && entry.length > 0) {
        return [`${path}.${key}`];
      }
      return collectSecretViolations(entry, `${path}.${key}`);
    });
  }
  return [];
}

export function secretFreeClone<T>(value: T): T {
  assertSecretFree(value);
  return structuredClone(value);
}

export function redactLogLine(line: string): string {
  return redactSecrets(line);
}

export function createLineRedactor(
  write: (chunk: string) => void,
): (chunk: Buffer | string) => void {
  let pending = "";
  return (chunk) => {
    pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      write(`${redactLogLine(line)}\n`);
    }
  };
}

export function flushLineRedactor(
  write: (chunk: string) => void,
  pendingHolder: { pending: string },
): void {
  if (pendingHolder.pending.length === 0) return;
  write(redactLogLine(pendingHolder.pending));
  pendingHolder.pending = "";
}
