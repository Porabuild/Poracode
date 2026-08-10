import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostPort } from "@poracode/agents-usage";
import type { OpenCodeWebSession } from "./openCodeWebSession";

/**
 * The web-session fetch is unit-tested in `openCodeWebSession.test.ts`;
 * here we mock it (and the Go-auth probe) to test the orchestrator's status
 * fall-through deterministically, without touching disk or the network.
 */
const goDb = vi.hoisted(() => ({
  hasOpenCodeGoAuth: vi.fn<() => boolean>(),
}));
const web = vi.hoisted(() => ({
  fetchOpenCodeWeb: vi.fn<() => Promise<OpenCodeWebSession>>(),
}));

vi.mock("./openCodeGoDb", () => goDb);
vi.mock("./openCodeWebSession", () => web);

const { scanOpenCodeUsage } = await import("./openCodeUsageScanner");

const NOW = 1_700_000_000_000;
const host = {} as HostPort;

beforeEach(() => {
  vi.clearAllMocks();
  goDb.hasOpenCodeGoAuth.mockReturnValue(false);
  web.fetchOpenCodeWeb.mockResolvedValue({ live: false });
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

  it("reports ok/Go with the web subscription windows when present", async () => {
    const goWindows = [
      { id: "session-5h" as const, label: "Rolling", usedPercent: 20, unit: "percent" as const },
      { id: "weekly" as const, label: "Weekly", usedPercent: 5, unit: "percent" as const },
    ];
    web.fetchOpenCodeWeb.mockResolvedValue({ live: true, goWindows });
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual(goWindows);
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
    const snap = await scanOpenCodeUsage(NOW, host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Go");
    expect(snap.windows).toEqual([]);
  });

  it("never invents plan meters from local spend when web windows are missing", async () => {
    goDb.hasOpenCodeGoAuth.mockReturnValue(true);
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
