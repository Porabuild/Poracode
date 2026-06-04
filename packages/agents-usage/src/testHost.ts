import type { HostPort, HttpRequest, OAuthToken } from "./host";

/**
 * In-memory {@link HostPort} for tests: no network, no filesystem, a fixed
 * clock. Provide tokens per provider id and canned HTTP responses per URL.
 */

export interface FakeRoute {
  status?: number;
  body?: string;
  bodyBytes?: Uint8Array;
  headers?: Record<string, string>;
}

export interface FakeHostConfig {
  nowMs?: number;
  tokens?: Record<string, OAuthToken | undefined>;
  secrets?: Record<string, Record<string, string>>;
  routes?: Record<string, FakeRoute>;
  /** Observe each outbound request (e.g. to assert headers). */
  onRequest?: (req: HttpRequest) => void;
}

export const FAKE_NOW_MS = 1_700_000_000_000;

export function createFakeHost(config: FakeHostConfig = {}): HostPort {
  const now = config.nowMs ?? FAKE_NOW_MS;
  return {
    now: () => now,
    credentials: {
      getOAuthToken: (id) => Promise.resolve(config.tokens?.[id]),
      getSecret: (id, key) => Promise.resolve(config.secrets?.[id]?.[key]),
    },
    http: {
      request: (req) => {
        config.onRequest?.(req);
        const route = config.routes?.[req.url];
        return Promise.resolve({
          status: route?.status ?? 200,
          headers: route?.headers ?? {},
          body: route?.body ?? "{}",
          ...(route?.bodyBytes ? { bodyBytes: route.bodyBytes } : {}),
        });
      },
    },
  };
}
