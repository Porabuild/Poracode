import type { HttpClient, HttpRequest, HttpResponse } from "@poracode/agents-usage";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Node implementation of the usage HostPort's HTTP client: global fetch with an
 * abort-based timeout. Extracted to its own leaf module (no other local imports)
 * so both the usage host and the Claude OAuth refresh path can reuse it without
 * an import cycle.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const NETWORK_RETRY_DELAY_MS = 1_000;
const TRANSIENT_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isTransientNetworkError(error: unknown): boolean {
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string" &&
    TRANSIENT_NETWORK_CODES.has(cause.code)
  );
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

export function createNodeHttpClient(): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const init: RequestInit = {
          method: req.method ?? "GET",
          ...(req.headers ? { headers: req.headers } : {}),
          ...(req.bodyBytes !== undefined
            ? { body: Buffer.from(req.bodyBytes) }
            : req.body !== undefined
              ? { body: req.body }
              : {}),
          ...(req.redirect ? { redirect: req.redirect } : {}),
          signal: controller.signal,
        };
        let res: Response;
        try {
          res = await fetch(req.url, init);
        } catch (error) {
          // A brief startup connection failure should not become a cached error
          // for the whole refresh interval. Replay only reads, once, within the
          // original deadline; OAuth exchanges and HTTP failures are not retried.
          if (
            (req.method ?? "GET") !== "GET" ||
            controller.signal.aborted ||
            !isTransientNetworkError(error)
          )
            throw error;
          await delay(NETWORK_RETRY_DELAY_MS, undefined, { signal: controller.signal });
          res = await fetch(req.url, init);
        }
        const bodyBytes = new Uint8Array(await res.arrayBuffer());
        const body = Buffer.from(bodyBytes).toString("utf8");
        // `headersToRecord` collapses repeated `set-cookie` into one comma-joined
        // value that cannot be split back apart (attributes contain commas), so
        // surface the raw lines separately for collectors that rotate a session
        // cookie. Same pitfall the relay host documents.
        const setCookies = res.headers.getSetCookie();
        return {
          status: res.status,
          headers: headersToRecord(res.headers),
          body,
          bodyBytes,
          ...(setCookies.length > 0 ? { setCookies } : {}),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
