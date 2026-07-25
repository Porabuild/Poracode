import type { GrokRefreshedToken, OAuthToken } from "@poracode/agents-usage";
import { describe, expect, it } from "vitest";
import { parseGrokAuth } from "./grokCredentials";
import {
  applyGrokRefreshToAuthJson,
  type GrokRefreshDeps,
  refreshGrokTokenIfDue,
  refreshRejectedGrokToken,
} from "./grokTokenRefresh";

const NOW = 1_717_000_000_000;
const PATH = "/tmp/does-not-exist/auth.json";

interface FakeDeps extends GrokRefreshDeps {
  writes: string[];
  refreshCalls: Array<{ refreshToken: string; clientId: string }>;
}

function fakeDeps(options: {
  content?: string;
  refreshed?: GrokRefreshedToken;
  nowMs?: number;
}): FakeDeps {
  const writes: string[] = [];
  const refreshCalls: Array<{ refreshToken: string; clientId: string }> = [];
  let content = options.content ?? "";
  return {
    writes,
    refreshCalls,
    now: () => options.nowMs ?? NOW,
    refresh: (input) => {
      refreshCalls.push(input);
      return Promise.resolve(options.refreshed);
    },
    readFile: () => {
      if (!options.content) throw new Error("ENOENT");
      return content;
    },
    writeFile: (_path, next) => {
      content = next;
      writes.push(next);
    },
  };
}

function authFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: "stale",
    refresh_token: "r1",
    client_id: "cli-client",
    expires_at: Math.floor((NOW - 60_000) / 1000),
    ...overrides,
  });
}

describe("parseGrokAuth", () => {
  it("carries the refresh token, client id, and normalized expiry", () => {
    const token = parseGrokAuth(authFile());
    expect(token).toEqual({
      accessToken: "stale",
      refreshToken: "r1",
      expiresAt: NOW - 60_000,
      raw: { clientId: "cli-client" },
    });
  });

  it("reads a nested tokens object and a client id beside it", () => {
    const token = parseGrokAuth(
      JSON.stringify({
        client_id: "outer-client",
        tokens: { accessToken: "a", refreshToken: "r", expiresAt: NOW + 600_000 },
      }),
    );
    expect(token).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: NOW + 600_000,
      raw: { clientId: "outer-client" },
    });
  });

  it("still resolves a bare token file", () => {
    expect(parseGrokAuth(JSON.stringify({ api_key: "k" }))).toEqual({ accessToken: "k" });
    expect(parseGrokAuth("not json")).toBeUndefined();
    expect(parseGrokAuth(JSON.stringify({ unrelated: 1 }))).toBeUndefined();
  });
});

/** The shape the OIDC-era Grok CLI actually writes. */
function oidcAuthFile(overrides: Record<string, unknown> = {}, name?: string): string {
  return JSON.stringify({
    [name ?? "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828"]: {
      key: "stale",
      auth_mode: "oidc",
      create_time: "2026-07-25T00:27:55.445119Z",
      email: "user@example.com",
      refresh_token: "r1",
      expires_at: "2026-07-25T06:27:55.445119Z",
      oidc_issuer: "https://auth.x.ai",
      oidc_client_id: "b1a00492-073a-47ea-816f-4c329264a828",
      ...overrides,
    },
  });
}

describe("parseGrokAuth on the OIDC CLI layout", () => {
  it("finds the token under the dynamic issuer::client_id container", () => {
    expect(parseGrokAuth(oidcAuthFile())).toEqual({
      accessToken: "stale",
      refreshToken: "r1",
      expiresAt: Date.parse("2026-07-25T06:27:55.445119Z"),
      raw: { clientId: "b1a00492-073a-47ea-816f-4c329264a828" },
    });
  });

  it("recovers the client id from the container name when the field is absent", () => {
    const token = parseGrokAuth(oidcAuthFile({ oidc_client_id: undefined }));
    expect(token?.raw).toEqual({ clientId: "b1a00492-073a-47ea-816f-4c329264a828" });
  });

  it("prefers the freshest identity when several are signed in", () => {
    const parsed = JSON.parse(oidcAuthFile());
    const older = JSON.parse(
      oidcAuthFile({ key: "older", expires_at: "2026-07-20T00:00:00Z" }, "https://auth.x.ai::old"),
    );
    expect(parseGrokAuth(JSON.stringify({ ...older, ...parsed }))?.accessToken).toBe("stale");
    expect(parseGrokAuth(JSON.stringify({ ...parsed, ...older }))?.accessToken).toBe("stale");
  });
});

describe("applyGrokRefreshToAuthJson", () => {
  const refreshed: GrokRefreshedToken = {
    accessToken: "fresh",
    refreshToken: "r2",
    expiresAt: NOW + 7_200_000,
  };

  it("reuses the file's own field names and epoch-seconds unit", () => {
    const next = JSON.parse(applyGrokRefreshToAuthJson(authFile(), refreshed)!);
    expect(next).toMatchObject({
      access_token: "fresh",
      refresh_token: "r2",
      client_id: "cli-client",
      expires_at: Math.floor((NOW + 7_200_000) / 1000),
    });
  });

  it("keeps millisecond and ISO expiries in their original form", () => {
    const ms = JSON.parse(applyGrokRefreshToAuthJson(authFile({ expires_at: NOW }), refreshed)!);
    expect(ms.expires_at).toBe(NOW + 7_200_000);

    const iso = JSON.parse(
      applyGrokRefreshToAuthJson(authFile({ expires_at: new Date(NOW).toISOString() }), refreshed)!,
    );
    expect(iso.expires_at).toBe(new Date(NOW + 7_200_000).toISOString());
  });

  it("writes into the nested container and preserves unrelated fields", () => {
    const next = JSON.parse(
      applyGrokRefreshToAuthJson(
        JSON.stringify({ email: "user@example.com", tokens: { accessToken: "a" } }),
        refreshed,
      )!,
    );
    expect(next).toEqual({
      email: "user@example.com",
      tokens: { accessToken: "fresh", refresh_token: "r2", expires_at: 1_717_007_200 },
    });
  });

  it("rewrites the OIDC container in place, keeping `key` and the ISO expiry", () => {
    const next = JSON.parse(applyGrokRefreshToAuthJson(oidcAuthFile(), refreshed)!);
    const entry = next["https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828"];
    expect(entry).toMatchObject({
      key: "fresh",
      refresh_token: "r2",
      expires_at: new Date(NOW + 7_200_000).toISOString(),
      oidc_client_id: "b1a00492-073a-47ea-816f-4c329264a828",
      email: "user@example.com",
    });
  });

  it("leaves unrecognized bodies alone", () => {
    expect(applyGrokRefreshToAuthJson("not json", refreshed)).toBeUndefined();
    expect(applyGrokRefreshToAuthJson(JSON.stringify({ nope: 1 }), refreshed)).toBeUndefined();
  });
});

describe("refreshGrokTokenIfDue", () => {
  const expired: OAuthToken = {
    accessToken: "stale",
    refreshToken: "r1",
    expiresAt: NOW - 60_000,
    raw: { clientId: "cli-client" },
  };

  it("renews an expired token and persists the rotated pair", async () => {
    const deps = fakeDeps({
      content: authFile(),
      refreshed: { accessToken: "fresh", refreshToken: "r2", expiresAt: NOW + 7_200_000 },
    });

    const token = await refreshGrokTokenIfDue(expired, deps, PATH);

    expect(deps.refreshCalls).toEqual([{ refreshToken: "r1", clientId: "cli-client" }]);
    expect(token.accessToken).toBe("fresh");
    expect(token.refreshToken).toBe("r2");
    expect(JSON.parse(deps.writes.at(-1)!).access_token).toBe("fresh");
  });

  it("does not call the network for a token that is still good", async () => {
    const deps = fakeDeps({ content: authFile() });
    const fresh: OAuthToken = { ...expired, expiresAt: NOW + 3_600_000 };

    expect(await refreshGrokTokenIfDue(fresh, deps, PATH)).toBe(fresh);
    expect(deps.refreshCalls).toEqual([]);
  });

  it("keeps the stale token when the file has no client id to refresh with", async () => {
    const deps = fakeDeps({ content: authFile() });
    const noClient: OAuthToken = { accessToken: "stale", refreshToken: "r1", expiresAt: NOW - 1 };

    expect(await refreshGrokTokenIfDue(noClient, deps, PATH)).toBe(noClient);
    expect(deps.refreshCalls).toEqual([]);
    expect(deps.writes).toEqual([]);
  });

  it("keeps the stale token when the refresh call fails", async () => {
    const deps = fakeDeps({ content: authFile() });
    expect((await refreshGrokTokenIfDue(expired, deps, PATH)).accessToken).toBe("stale");
    expect(deps.writes).toEqual([]);
  });
});

describe("refreshRejectedGrokToken", () => {
  it("returns a token another process already rotated, without a POST", async () => {
    const deps = fakeDeps({ content: authFile({ access_token: "rotated-elsewhere" }) });

    const next = await refreshRejectedGrokToken({ accessToken: "stale" }, deps, PATH);

    expect(next?.accessToken).toBe("rotated-elsewhere");
    expect(deps.refreshCalls).toEqual([]);
  });

  it("refreshes the stored token when the file still holds the rejected one", async () => {
    const deps = fakeDeps({
      content: authFile(),
      refreshed: { accessToken: "fresh", refreshToken: "r2", expiresAt: NOW + 7_200_000 },
    });

    const next = await refreshRejectedGrokToken({ accessToken: "stale" }, deps, PATH);

    expect(next?.accessToken).toBe("fresh");
    expect(deps.refreshCalls).toEqual([{ refreshToken: "r1", clientId: "cli-client" }]);
  });

  it("returns undefined when refresh cannot produce a different token", async () => {
    const deps = fakeDeps({ content: authFile() });
    expect(await refreshRejectedGrokToken({ accessToken: "stale" }, deps, PATH)).toBeUndefined();
  });
});
