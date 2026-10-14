import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostPort, UsageWindow } from "@poracode/agents-usage";
import type { OpenCodeWebSession } from "./openCodeWebSession";

/**
 * The endpoint fetchers (direct Go API + web session) are unit-tested in
 * `openCodeGoApi.test.ts` (package) and `openCodeWebSession.test.ts`; here we
 * mock them (and the Go-auth probe) to test the orchestrator's source priority
 * and status fall-through deterministically, without touching disk or the network.
 */
const goDb = vi.hoisted(() => ({
  hasOpenCodeGoAuth: vi.fn<() => boolean>(),
  readOpenCodeGoApiKey: vi.fn<() => string | undefined>(),
}));
const web = vi.hoisted(() => ({
  fetchOpenCodeWeb: vi.fn<() => Promise<OpenCodeWebSession>>(),
}));
const agentsUsage = vi.hoisted(() => ({
  fetchOpenCodeGoApiUsage:
    vi.fn<(http: unknown, apiKey: string) => Promise<UsageWindow[] | undefined>>(),
}));

vi.mock("./openCodeGoDb", () => goDb);
vi.mock("./openCodeWebSession", () => web);
vi.mock("@poracode/agents-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@poracode/agents-usage")>();
  return { ...actual, fetchOpenCodeGoApiUsage: agentsUsage.fetchOpenCodeGoApiUsage };
});

const { scanOpenCodeUsage } = await import("./openCodeUsageScanner");

const NOW = 1_700_000_000_000;
const host = {} as HostPort;

const API_WINDOWS: UsageWindow[] = [
  { id: "session-5h", label: "Rolling", usedPercent: 9, unit: "percent" },
  { id: "weekly", label: "Weekly", usedPercent: 12, unit: "percent" },
];

beforeEach(() => {
  vi.clearAllMocks();
  goDb.hasOpenCodeGoAuth.mockReturnValue(false);
  goDb.readOpenCodeGoApiKey.mockReturnValue(undefined);
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
    goDb.readOpenCodeGoApiKey.mockReturnValue("tok");
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
    goDb.readOpenCodeGoApiKey.mockReturnValue("tok");
    agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(API_WINDOWS);
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, balance: 9 });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(API_WINDOWS);
    expect(snap.credits).toEqual({ balance: 9, currency: "USD", label: "Zen balance" });
  });

  it("falls back to the web session windows when the direct API fails", async () => {
    goDb.readOpenCodeGoApiKey.mockReturnValue("tok");
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

  it("reports ok/Go with empty meters when only the local Go key is present", async () => {
    // Local CLI key proves the user is on Go, but device spend must not be shown
    // as plan quota — that path undercounts vs the console.
    goDb.hasOpenCodeGoAuth.mockReturnValue(true);
    goDb.readOpenCodeGoApiKey.mockReturnValue("tok");
    agentsUsage.fetchOpenCodeGoApiUsage.mockResolvedValue(undefined);
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual([]);
  });

  it("never invents plan meters from local spend when both endpoints fail", async () => {
    goDb.hasOpenCodeGoAuth.mockReturnValue(true);
    goDb.readOpenCodeGoApiKey.mockReturnValue("tok");
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
