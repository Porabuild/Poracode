import type { McpServer, McpTransport } from "@/shared/contracts";

/** Placeholder substituted for every secret-bearing value returned by get_settings. */
export const REDACTED_VALUE = "«redacted»";

/** Mask the credential-bearing values of one MCP server's transport. */
export function redactMcpServer(server: McpServer): McpServer {
  return { ...server, transport: redactMcpTransport(server.transport) };
}

/** Replace every transport header/env value with a masked marker, keeping key names. */
function redactMcpTransport(transport: McpTransport): McpTransport {
  if (transport.type === "stdio") {
    return {
      ...transport,
      args: transport.args.map(redactSecretArg),
      env: maskValues(transport.env),
    };
  }
  return {
    ...transport,
    url: redactUrlQuery(transport.url),
    headers: maskValues(transport.headers),
  };
}

const SECRET_ARG_PATTERN = /^(--?[^=]*(?:key|token|secret|password|auth|credential)[^=]*)=.+$/i;

/** Mask the value of secret-shaped `--flag=value` args, keeping the flag name. */
function redactSecretArg(arg: string): string {
  const match = SECRET_ARG_PATTERN.exec(arg);
  return match ? `${match[1]}=${REDACTED_VALUE}` : arg;
}

/** Remove legacy URL credentials/fragments and mask every query value, keeping keys. */
function redactUrlQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    for (const key of parsed.searchParams.keys()) parsed.searchParams.set(key, REDACTED_VALUE);
    return parsed.toString().replaceAll(encodeURIComponent(REDACTED_VALUE), REDACTED_VALUE);
  } catch {
    return REDACTED_VALUE;
  }
}

/** Map every value of a string record to the redaction marker, preserving keys. */
function maskValues(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(record).map((key) => [key, REDACTED_VALUE]));
}

/**
 * Inverse of {@link redactMcpTransport}: wherever an incoming transport still
 * carries the {@link REDACTED_VALUE} marker (because an agent echoed back a
 * redacted read), substitute the real value stored on the existing transport.
 * Only matching same-type transports can restore values; a transport-type
 * change keeps the incoming (already-validated) values verbatim.
 */
export function restoreRedactedTransport(next: McpTransport, existing: McpTransport): McpTransport {
  if (next.type === "stdio") {
    if (existing.type !== "stdio") return next;
    return {
      ...next,
      args: next.args.map((arg) => restoreRedactedArg(arg, existing.args)),
      env: restoreRedactedRecord(next.env, existing.env),
    };
  }
  if (existing.type === "stdio") return next;
  return {
    ...next,
    url: restoreRedactedUrl(next.url, existing.url),
    headers: restoreRedactedRecord(next.headers, existing.headers),
  };
}

/** Restore any redaction-marked values in a string record from the stored record. */
function restoreRedactedRecord(
  next: Record<string, string>,
  existing: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(next).map(([key, value]) => [
      key,
      value === REDACTED_VALUE && Object.prototype.hasOwnProperty.call(existing, key)
        ? existing[key]!
        : value,
    ]),
  );
}

/** Restore a `--flag=«redacted»` arg from the stored arg carrying the same flag. */
function restoreRedactedArg(arg: string, existingArgs: readonly string[]): string {
  const marker = `=${REDACTED_VALUE}`;
  if (!arg.endsWith(marker)) return arg;
  const prefix = arg.slice(0, arg.length - REDACTED_VALUE.length); // includes trailing "="
  return existingArgs.find((candidate) => candidate.startsWith(prefix)) ?? arg;
}

/** Restore redaction-marked URL query values from the stored URL's matching keys. */
function restoreRedactedUrl(next: string, existing: string): string {
  const queryStart = next.indexOf("?");
  if (queryStart === -1) return next;
  const existingQuery = parseQuery(existing);
  const query = next
    .slice(queryStart + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (value === REDACTED_VALUE && Object.prototype.hasOwnProperty.call(existingQuery, key)) {
        return `${key}=${existingQuery[key]}`;
      }
      return pair;
    })
    .join("&");
  return `${next.slice(0, queryStart)}?${query}`;
}

/** Parse a URL's query string into a key→value record (first value wins). */
function parseQuery(url: string): Record<string, string> {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return {};
  const out: Record<string, string> = {};
  for (const pair of url.slice(queryStart + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = pair.slice(eq + 1);
  }
  return out;
}
