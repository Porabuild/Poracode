import { type HttpClient, isOpenCodeSessionLive } from "@lightcode/agents-usage";

/**
 * Verifies a captured opencode.ai `Cookie` header is a *real* signed-in session,
 * not a stale or mid-`/authorize` cookie that merely shares the `auth` name. Used
 * to gate the browser-login "Found a signed-in session" prompt. Runs the same
 * workspace probe as the usage scanner via the shared `@lightcode/agents-usage`
 * helper, backed here by global fetch (the supervisor scanner injects its own
 * HTTP client).
 */

const PROBE_TIMEOUT_MS = 5_000;

const fetchHttpClient: HttpClient = {
  async request(req) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(req.url, {
        method: req.method ?? "GET",
        ...(req.headers ? { headers: req.headers } : {}),
        ...(req.body !== undefined ? { body: req.body } : {}),
        signal: controller.signal,
      });
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: res.status, headers, body };
    } finally {
      clearTimeout(timeout);
    }
  },
};

/** Resolves true iff the cookie authenticates as a live opencode.ai session. */
export function isOpenCodeLoginCookieLive(cookieHeader: string): Promise<boolean> {
  return isOpenCodeSessionLive(fetchHttpClient, cookieHeader);
}
