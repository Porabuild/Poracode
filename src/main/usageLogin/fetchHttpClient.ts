import type { HttpClient } from "@poracode/agents-usage";

const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Minimal `HttpClient` backed by global `fetch` for usage-login session probes.
 * Each probe runs the same "is this session live" check as its supervisor
 * collector, which injects its own HTTP client. Here we provide a fetch-backed
 * one with an AbortController timeout and lower-cased response headers.
 */
export const fetchHttpClient: HttpClient = {
  async request(req) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
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
