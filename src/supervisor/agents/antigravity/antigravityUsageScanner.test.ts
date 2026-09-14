import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import { describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  resolveAntigravityAcpCredentials,
  type AntigravityAcpCredentials,
} from "./antigravityAcpCredentials";
import { scanAntigravityUsage, type AntigravityUsageScannerDeps } from "./antigravityUsageScanner";

vi.mock("./antigravityProcessScan", () => ({
  resolveAntigravityLsEndpoints: async () => ({ ports: [], csrfTokens: [] }),
}));

vi.mock("./antigravityAcpCredentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./antigravityAcpCredentials")>()),
  resolveAntigravityAcpCredentials: vi.fn<typeof resolveAntigravityAcpCredentials>(
    async () => undefined,
  ),
  readAntigravityAcpKeychainFingerprint: async () => "keychain-source",
}));

const NOW = 1_717_000_000_000;
const HOST = {
  http: { request: async () => ({ status: 500, headers: {}, body: "" }) },
  credentials: {
    getOAuthToken: async () => undefined,
    getSecret: async () => undefined,
  },
  now: () => NOW,
} as unknown as HostPort;
const CREDENTIALS: AntigravityAcpCredentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};
const SNAPSHOT: UsageSnapshot = {
  providerId: "antigravity",
  status: "ok",
  windows: [{ id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 20 }],
  fetchedAt: NOW,
};

function deps(overrides: Partial<AntigravityUsageScannerDeps>): AntigravityUsageScannerDeps {
  return {
    scanLanguageServer: async () => undefined,
    resolveAcpCredentials: async () => undefined,
    invalidateAcpCredentials: async () => {},
    collectCloudUsage: async () => SNAPSHOT,
    ...overrides,
  };
}

describe("scanAntigravityUsage", () => {
  it("prefers a live language-server snapshot", async () => {
    const resolveAcpCredentials = vi.fn<() => Promise<AntigravityAcpCredentials | undefined>>();
    const snapshot = await scanAntigravityUsage(
      NOW,
      [],
      HOST,
      deps({ scanLanguageServer: async () => SNAPSHOT, resolveAcpCredentials }),
    );
    expect(snapshot).toBe(SNAPSHOT);
    expect(resolveAcpCredentials).not.toHaveBeenCalled();
  });

  it("uses ACP-backed Cloud Code when no language server is reachable", async () => {
    const collectCloudUsage = vi.fn<
      (
        nowMs: number,
        host: HostPort,
        credentials: AntigravityAcpCredentials,
      ) => Promise<UsageSnapshot>
    >(async () => SNAPSHOT);
    const snapshot = await scanAntigravityUsage(
      NOW,
      ["Ubuntu"],
      HOST,
      deps({ resolveAcpCredentials: async () => CREDENTIALS, collectCloudUsage }),
    );
    expect(snapshot).toBe(SNAPSHOT);
    expect(collectCloudUsage).toHaveBeenCalledWith(NOW, HOST, CREDENTIALS);
  });

  it("retains app-not-running when neither source is available", async () => {
    await expect(scanAntigravityUsage(NOW, [], HOST, deps({}))).resolves.toEqual({
      providerId: "antigravity",
      status: "app-not-running",
      windows: [],
      fetchedAt: NOW,
    });
  });

  it("drops the cached credentials when Cloud Code rejects the stored artifact", async () => {
    const invalidateAcpCredentials = vi.fn<AntigravityUsageScannerDeps["invalidateAcpCredentials"]>(
      async () => {},
    );
    await scanAntigravityUsage(
      NOW,
      [],
      HOST,
      deps({
        resolveAcpCredentials: async () => CREDENTIALS,
        collectCloudUsage: async () => ({
          providerId: "antigravity",
          status: "auth-missing",
          windows: [],
          fetchedAt: NOW,
        }),
        invalidateAcpCredentials,
      }),
    );
    expect(invalidateAcpCredentials).toHaveBeenCalledExactlyOnceWith(HOST, CREDENTIALS);
  });

  it("keeps the cached credentials while Cloud Code answers", async () => {
    const invalidateAcpCredentials = vi.fn<AntigravityUsageScannerDeps["invalidateAcpCredentials"]>(
      async () => {},
    );
    await scanAntigravityUsage(
      NOW,
      [],
      HOST,
      deps({ resolveAcpCredentials: async () => CREDENTIALS, invalidateAcpCredentials }),
    );
    expect(invalidateAcpCredentials).not.toHaveBeenCalled();
  });

  it("loads and invalidates durable credentials through the default scanner path", async () => {
    const host = {
      ...HOST,
      credentials: {
        getOAuthToken: async () => undefined,
        getSecret: vi.fn<HostPort["credentials"]["getSecret"]>(async () =>
          JSON.stringify({
            client_id: CREDENTIALS.clientId,
            client_secret: CREDENTIALS.clientSecret,
            refresh_token: CREDENTIALS.refreshToken,
            token_uri: ANTIGRAVITY_GOOGLE_TOKEN_URI,
            keychainFingerprint: "keychain-source",
          }),
        ),
        setSecret: vi.fn<NonNullable<HostPort["credentials"]["setSecret"]>>(async () => {}),
      },
      http: {
        request: vi.fn<HostPort["http"]["request"]>(async () => ({
          status: 401,
          headers: {},
          body: "{}",
        })),
      },
    } satisfies HostPort;

    const snapshot = await scanAntigravityUsage(NOW, [], host);
    expect(snapshot.status).toBe("auth-missing");
    expect(host.credentials.getSecret).toHaveBeenCalledExactlyOnceWith(
      "antigravity",
      "acp-credentials-v1",
    );
    expect(resolveAntigravityAcpCredentials).not.toHaveBeenCalled();
    expect(host.http.request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        url: ANTIGRAVITY_GOOGLE_TOKEN_URI,
        body: expect.stringContaining("refresh_token=refresh-token"),
      }),
    );
    expect(host.credentials.setSecret).toHaveBeenCalledExactlyOnceWith(
      "antigravity",
      "acp-credentials-v1",
      "null",
    );

    host.http.request.mockClear();
    const next = await scanAntigravityUsage(NOW + 120_000, [], host);
    expect(next.status).toBe("app-not-running");
    expect(resolveAntigravityAcpCredentials).toHaveBeenCalledOnce();
    expect(host.http.request).not.toHaveBeenCalled();
  });
});
