import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import { describe, expect, it, vi } from "vitest";
import type { AntigravityAcpCredentials } from "./antigravityAcpCredentials";
import { scanAntigravityUsage, type AntigravityUsageScannerDeps } from "./antigravityUsageScanner";

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
});
