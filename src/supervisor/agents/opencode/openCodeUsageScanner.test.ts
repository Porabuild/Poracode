import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostPort, UsageWindow } from "@poracode/agents-usage";
import type { OpenCodeWebSession } from "../../runtime/openCodeWebSession";
import { UsageService } from "../../runtime/usageService";
import type { OpenCodeUsageCredential } from "./openCodeGoDb";

/**
 * The endpoint fetchers (direct Go API + web session) are unit-tested in
 * `openCodeGoApi.test.ts` (package) and `openCodeWebSession.test.ts`; here we
 * mock them (and the Go-auth probe) to test the orchestrator's source priority
 * and status fall-through deterministically, without touching disk or the network.
 */
const goDb = vi.hoisted(() => ({
  readOpenCodeUsageCredential: vi.fn<() => Promise<OpenCodeUsageCredential | undefined>>(),
}));
const web = vi.hoisted(() => ({
  fetchOpenCodeWeb: vi.fn<() => Promise<OpenCodeWebSession>>(),
}));
const agentsUsage = vi.hoisted(() => ({
  fetchOpenCodeGoApiUsage:
    vi.fn<(http: unknown, apiKey: string) => Promise<UsageWindow[] | undefined>>(),
}));

vi.mock("./openCodeGoDb", () => goDb);
vi.mock("../../runtime/openCodeWebSession", () => web);
vi.mock("@poracode/agents-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@poracode/agents-usage")>();
  return { ...actual, fetchOpenCodeGoApiUsage: agentsUsage.fetchOpenCodeGoApiUsage };
});

const { scanOpenCodeUsage } = await import("./openCodeUsageScanner");

const NOW = 1_700_000_000_000;
const host: HostPort = {
  now: () => NOW,
  http: {
    request: async () => {
      throw new Error("Unexpected HTTP request");
    },
  },
  credentials: {
    getOAuthToken: async () => undefined,
    getSecret: async () => undefined,
  },
};

const API_WINDOWS: UsageWindow[] = [
  { id: "session-5h", label: "Rolling", usedPercent: 9, unit: "percent" },
  { id: "weekly", label: "Weekly", usedPercent: 12, unit: "percent" },
];

beforeEach(() => {
  vi.clearAllMocks();
  goDb.readOpenCodeUsageCredential.mockResolvedValue(undefined);
  web.fetchOpenCodeWeb.mockResolvedValue({ live: false });
  agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(undefined);
});

describe("scanOpenCodeUsage", () => {
  it("is auth-missing with no local auth and no live web session", async () => {
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });

  it("reports ok/Zen for a live web session without a Go subscription", async () => {
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, balance: 9 });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Zen");
    expect(snap.windows).toEqual([]);
    expect(snap.credits).toMatchObject({ balance: 9, currency: "USD" });
  });

  it("reports ok/Go with the web subscription windows when no API key is configured", async () => {
    const goWindows = [
      { id: "session-5h" as const, label: "Rolling", usedPercent: 20, unit: "percent" as const },
      { id: "weekly" as const, label: "Weekly", usedPercent: 5, unit: "percent" as const },
    ];
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, goWindows });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(goWindows);
    expect(agentsUsage.fetchOpenCodeGoApiUsage).not.toHaveBeenCalled();
  });

  it("prefers the direct API windows over the web session windows", async () => {
    goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Go" });
    agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(API_WINDOWS);
    const webWindows = [
      { id: "session-5h" as const, label: "Rolling", usedPercent: 20, unit: "percent" as const },
      { id: "weekly" as const, label: "Weekly", usedPercent: 5, unit: "percent" as const },
    ];
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, goWindows: webWindows });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(API_WINDOWS);
    expect(agentsUsage.fetchOpenCodeGoApiUsage).toHaveBeenCalledWith(host.http, "tok");
  });

  it("keeps the Zen balance alongside direct API windows", async () => {
    goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Go" });
    agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(API_WINDOWS);
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, balance: 9 });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(API_WINDOWS);
    expect(snap.credits).toEqual({ balance: 9, currency: "USD", label: "Zen balance" });
  });

  it("falls back to the web session windows when the direct API fails", async () => {
    goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Go" });
    agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(undefined);
    const webWindows = [
      { id: "session-5h" as const, label: "Rolling", usedPercent: 20, unit: "percent" as const },
      { id: "weekly" as const, label: "Weekly", usedPercent: 5, unit: "percent" as const },
    ];
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, goWindows: webWindows });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(webWindows);
  });

  it("keeps a valid Zen balance successful when the key has no Go windows", async () => {
    goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Zen" });
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, balance: 9 });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.windows).toEqual([]);
    expect(snap.plan).toBe("Zen");
    expect(snap.credits).toEqual({ balance: 9, currency: "USD", label: "Zen balance" });
  });

  it("retains Go quota after a failed quota refresh even when the Zen balance succeeds", async () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-quota-refresh-"));
    const service = new UsageService({
      emit: () => {},
      cachePath: join(root, "usage.json"),
      host,
      providerIds: ["opencode"],
      profileSources: () => [],
      localCollectors: [{ id: "opencode", collect: scanOpenCodeUsage }],
    });
    try {
      goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Go" });
      agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(API_WINDOWS);
      await service.refreshProviderUsage({ providerIds: ["opencode"], force: true });
      agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(undefined);
      web.fetchOpenCodeWeb.mockResolvedValue({ live: true, balance: 9 });
      const refreshed = await service.refreshProviderUsage({
        providerIds: ["opencode"],
        force: true,
      });
      expect(refreshed.snapshots).toEqual([
        expect.objectContaining({ status: "error", plan: "Go", windows: API_WINDOWS }),
      ]);
    } finally {
      service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the Zen balance alongside Go subscription windows", async () => {
    const goWindows = [
      { id: "session-5h" as const, label: "Rolling", usedPercent: 20, unit: "percent" as const },
      { id: "weekly" as const, label: "Weekly", usedPercent: 5, unit: "percent" as const },
    ];
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, balance: 9, goWindows });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(goWindows);
    expect(snap.credits).toEqual({ balance: 9, currency: "USD", label: "Zen balance" });
  });

  it("reports a collection error when the Go key yields no server windows", async () => {
    // Local CLI key proves the user is on Go, but device spend must not be shown
    // as plan quota — that path undercounts vs the console.
    goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Go" });
    agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(undefined);
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("error");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual([]);
  });

  it("never invents plan meters from local spend when both endpoints fail", async () => {
    goDb.readOpenCodeUsageCredential.mockResolvedValue({ apiKey: "tok", plan: "Go" });
    web.fetchOpenCodeWeb.mockResolvedValue({ live: false });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.windows).toEqual([]);
    expect(snap.plan).toBe("Go");
  });

  it("is auth-missing when no host is provided and there is no local Go key", async () => {
    const snap = await scanOpenCodeUsage(NOW);
    expect(snap.status).toBe("auth-missing");
    expect(web.fetchOpenCodeWeb).not.toHaveBeenCalled();
  });
});
