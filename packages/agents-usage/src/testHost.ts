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
  /** Raw `Set-Cookie` lines, for collectors that rotate a stored session cookie. */
  setCookies?: string[];
}

export interface FakeHostConfig {
  nowMs?: number;
  tokens?: Record<string, OAuthToken | undefined>;
  secrets?: Record<string, Record<string, string>>;
  routes?: Record<string, FakeRoute>;
  /** Observe each outbound request (e.g. to assert headers). */
  onRequest?: (req: HttpRequest) => void;
  /** Return a fresh/fallback OAuth token after a collector sees token rejection. */
  refreshOAuthToken?: (providerId: string, token: OAuthToken) => Promise<OAuthToken | undefined>;
  /** Observe `setSecret` writes (e.g. to assert a rotated token was persisted). */
  onSetSecret?: (providerId: string, key: string, value: string) => void;
}

export const FAKE_NOW_MS = 1_700_000_000_000;

export function createFakeHost(config: FakeHostConfig = {}): HostPort {
  const now = config.nowMs ?? FAKE_NOW_MS;
  // Live, mutable view so a collector that writes via setSecret reads back its
  // own rotated values within the same test run.
  const secrets = config.secrets ?? {};
  return {
    now: () => now,
    credentials: {
      getOAuthToken: (id) => Promise.resolve(config.tokens?.[id]),
      ...(config.refreshOAuthToken ? { refreshOAuthToken: config.refreshOAuthToken } : {}),
      getSecret: (id, key) => Promise.resolve(secrets[id]?.[key]),
      setSecret: (id, key, value) => {
        (secrets[id] ??= {})[key] = value;
        config.onSetSecret?.(id, key, value);
        return Promise.resolve();
      },
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
          ...(route?.setCookies ? { setCookies: route.setCookies } : {}),
        });
      },
    },
  };
}
