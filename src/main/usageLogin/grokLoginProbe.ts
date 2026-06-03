import { type HttpClient, isGrokSessionLive } from "@lightcode/agents-usage";

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

export function isGrokLoginCookieLive(cookieHeader: string): Promise<boolean> {
  return isGrokSessionLive(fetchHttpClient, cookieHeader);
}
