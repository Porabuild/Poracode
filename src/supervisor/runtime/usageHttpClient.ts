import type { HttpClient, HttpRequest, HttpResponse } from "@poracode/agents-usage";

/**
 * Node implementation of the usage HostPort's HTTP client: global fetch with an
 * abort-based timeout. Extracted to its own leaf module (no other local imports)
 * so both the usage host and the Claude OAuth refresh path can reuse it without
 * an import cycle.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

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
        const res = await fetch(req.url, {
          method: req.method ?? "GET",
          ...(req.headers ? { headers: req.headers } : {}),
          ...(req.bodyBytes !== undefined
            ? { body: Buffer.from(req.bodyBytes) }
            : req.body !== undefined
              ? { body: req.body }
              : {}),
          signal: controller.signal,
        });
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
