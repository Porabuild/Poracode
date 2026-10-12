import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import { UsageService } from "./usageService";

const directories: string[] = [];
const now = 1_700_000_000_000;
const host: HostPort = {
  now: () => now,
  credentials: { getOAuthToken: async () => undefined, getSecret: async () => undefined },
  http: {
    request: async () => {
      throw new Error("Unexpected HTTP request");
    },
  },
};
function cachePath() {
  const root = mkdtempSync(join(tmpdir(), "usage-profile-source-"));
  directories.push(root);
  return join(root, "usage.json");
}
function snapshot(providerId: string): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    fetchedAt: now,
    windows: [{ id: "weekly", label: "Weekly", usedPercent: 25 }],
  };
}
afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("registered usage sources", () => {
  it("collects opaque profile ids and overrides a local account exactly once", async () => {
    const local = vi.fn<() => Promise<UsageSnapshot>>(async () => snapshot("fixture"));
    const account = vi.fn<() => Promise<UsageSnapshot>>(async () => snapshot("fixture"));
    const profile = vi.fn<() => Promise<UsageSnapshot>>(async () => snapshot("fixture:work"));
    const service = new UsageService({
      cachePath: cachePath(),
      host,
      emit: () => {},
      providerIds: ["fixture", "fixture:work"],
      localCollectors: [{ id: "fixture", collect: local }],
      profileSources: () => [
        {
          collectors: [
            { providerId: "fixture", collect: account },
            { providerId: "fixture:work", collect: profile },
          ],
        },
      ],
    });
    const result = await service.refreshProviderUsage({});
    expect(result.snapshots.map((entry) => entry.providerId)).toEqual(["fixture", "fixture:work"]);
    expect(local).not.toHaveBeenCalled();
    expect(account).toHaveBeenCalledExactlyOnceWith(host);
    expect(profile).toHaveBeenCalledExactlyOnceWith(host);
  });

  it("isolates collection and enrichment failures from another account's quota", async () => {
    const service = new UsageService({
      cachePath: cachePath(),
      host,
      emit: () => {},
      providerIds: ["fixture:broken", "fixture:healthy"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            {
              providerId: "fixture:broken",
              collect: async () => {
                throw new Error("private credential diagnostic");
              },
            },
            { providerId: "fixture:healthy", collect: async () => snapshot("fixture:healthy") },
          ],
          enrichSnapshot: async () => {
            throw new Error("Optional enrichment failed");
          },
        },
      ],
    });
    const result = await service.refreshProviderUsage({});
    expect(result.snapshots).toEqual([
      { providerId: "fixture:broken", status: "error", windows: [], fetchedAt: now },
      snapshot("fixture:healthy"),
    ]);
    expect(JSON.stringify(result)).not.toContain("private credential");
  });
});

describe("usage account-source custody", () => {
  it("retires changed account cache under manual-only policy without collecting a sibling", async () => {
    let identity = "account-a";
    let clock = now;
    const path = cachePath();
    const settingsPath = `${path}.settings.json`;
    writeFileSync(
      settingsPath,
      JSON.stringify({
        usage: { autoRefresh: false, providerRefreshIntervals: { "fixture:work": 2 } },
      }),
    );
    const collect = vi.fn<() => Promise<UsageSnapshot>>(async () => ({
      ...snapshot("fixture:work"),
      fetchedAt: clock,
    }));
    const sibling = vi.fn<() => Promise<UsageSnapshot>>(async () => snapshot("fixture:other"));
    const service = new UsageService({
      cachePath: path,
      settingsPath,
      host: { ...host, now: () => clock },
      emit: () => {},
      providerIds: ["fixture:work", "fixture:other"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            { providerId: "fixture:work", cacheIdentity: async () => identity, collect },
            { providerId: "fixture:other", collect: sibling },
          ],
        },
      ],
    });
    await service.refreshProviderUsage({ providerIds: ["fixture:work"], force: true });
    clock += 600_000;
    expect((await service.getProviderUsage({ providerIds: ["fixture:work"] })).snapshots).toEqual([
      snapshot("fixture:work"),
    ]);
    identity = "account-b";
    expect((await service.getProviderUsage({ providerIds: ["fixture:work"] })).snapshots).toEqual(
      [],
    );
    expect(await service.refreshDueProviders()).toEqual([]);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(sibling).not.toHaveBeenCalled();
    const fresh = await service.refreshProviderUsage({
      providerIds: ["fixture:work"],
      force: true,
    });
    expect(fresh.snapshots[0]?.fetchedAt).toBe(clock);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(sibling).not.toHaveBeenCalled();
  });

  it("does not restore a retired account while another provider enriches usage", async () => {
    let identity = "account-a";
    let release!: () => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const path = cachePath();
    const settingsPath = `${path}.settings.json`;
    writeFileSync(settingsPath, JSON.stringify({ usage: { showEstimatedCost: true } }));
    const emit = vi.fn<(event: import("@/shared/ipc").SupervisorEvent) => void>();
    const service = new UsageService({
      cachePath: path,
      settingsPath,
      host,
      emit,
      providerIds: ["fixture", "fixture:slow"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            {
              providerId: "fixture",
              cacheIdentity: async () => identity,
              collect: async () => snapshot("fixture"),
            },
            { providerId: "fixture:slow", collect: async () => snapshot("fixture:slow") },
          ],
          enrichSnapshot: async (value) => {
            if (value.providerId === "fixture:slow") {
              notifyStarted();
              await blocked;
            }
            return value;
          },
        },
      ],
    });
    const pending = service.refreshProviderUsage({});
    await started;
    identity = "account-b";
    await service.reconcileProfileSources();
    emit.mockClear();
    release();
    const result = await pending;
    expect(result.snapshots.map((value) => value.providerId)).toEqual(["fixture:slow"]);
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "provider-usage", snapshot: snapshot("fixture") }),
    );
    expect((await service.getProviderUsage({ providerIds: ["fixture"] })).snapshots).toEqual([]);
    const reopened = new UsageService({
      cachePath: path,
      settingsPath,
      host,
      emit: () => {},
      providerIds: ["fixture"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            {
              providerId: "fixture",
              cacheIdentity: async () => identity,
              collect: async () => snapshot("fixture"),
            },
          ],
        },
      ],
    });
    expect((await reopened.getProviderUsage({})).snapshots).toEqual([]);
  });

  it("drops a cached quota when the source fingerprint changes", async () => {
    let identity = "account-a";
    const service = new UsageService({
      cachePath: cachePath(),
      host,
      emit: () => {},
      providerIds: ["fixture"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            {
              providerId: "fixture",
              cacheIdentity: async () => identity,
              collect: async () => snapshot("fixture"),
            },
          ],
        },
      ],
    });
    await service.refreshProviderUsage({});
    expect((await service.getProviderUsage({})).snapshots).toHaveLength(1);
    identity = "account-b";
    expect((await service.getProviderUsage({})).snapshots).toEqual([]);
    await service.refreshProviderUsage({});
    expect((await service.getProviderUsage({})).snapshots).toHaveLength(1);
  });

  it("discards an in-flight quota from the previous account without retaining its cache", async () => {
    let identity = "account-a";
    let release!: (value: UsageSnapshot) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const service = new UsageService({
      cachePath: cachePath(),
      host,
      emit: () => {},
      providerIds: ["fixture"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            {
              providerId: "fixture",
              cacheIdentity: async () => identity,
              collect: () => {
                notifyStarted();
                return new Promise((resolve) => {
                  release = resolve;
                });
              },
            },
          ],
        },
      ],
    });
    const pending = service.refreshProviderUsage({});
    await started;
    identity = "account-b";
    release(snapshot("fixture"));
    expect((await pending).snapshots).toEqual([]);
  });

  it("publishes account-source retirement immediately without fetching quota", async () => {
    let identity = "account-a";
    const emit = vi.fn<(event: import("@/shared/ipc").SupervisorEvent) => void>();
    const collect = vi.fn<() => Promise<UsageSnapshot>>(async () => snapshot("fixture"));
    const service = new UsageService({
      cachePath: cachePath(),
      host,
      emit,
      providerIds: ["fixture"],
      localCollectors: [],
      profileSources: () => [
        { collectors: [{ providerId: "fixture", cacheIdentity: async () => identity, collect }] },
      ],
    });
    await service.refreshProviderUsage({});
    identity = "account-b";
    await service.reconcileProfileSources();
    expect(emit).toHaveBeenLastCalledWith({ type: "provider-usage-all", snapshots: [] });
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("fails closed when source identity cannot be read", async () => {
    let readable = true;
    const service = new UsageService({
      cachePath: cachePath(),
      host,
      emit: () => {},
      providerIds: ["fixture"],
      localCollectors: [],
      profileSources: () => [
        {
          collectors: [
            {
              providerId: "fixture",
              cacheIdentity: async () => {
                if (!readable) throw new Error("private diagnostic");
                return "account-a";
              },
              collect: async () => snapshot("fixture"),
            },
          ],
        },
      ],
    });
    await service.refreshProviderUsage({});
    readable = false;
    expect((await service.getProviderUsage({})).snapshots).toEqual([]);
    expect((await service.refreshProviderUsage({})).snapshots).toEqual([]);
  });
});
