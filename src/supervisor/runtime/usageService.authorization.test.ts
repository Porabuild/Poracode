import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMacKeychainPassword, resetMacKeychainStateForTests } from "./macKeychain";
import { UsageService } from "./usageService";
import { coalesceByKey } from "@/shared/coalesce";
import type { LocalUsageCollector } from "./localUsageCollectors";
import { mockExecFileCommand } from "./macKeychain.testFixtures";

const security = vi.hoisted(() => vi.fn<() => Promise<{ stdout: string }>>());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: (...args: Parameters<typeof security>) =>
      mockExecFileCommand(security(...args)),
  }),
}));

describe("UsageService credential authorization", () => {
  let cacheDir: string;
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  const host: HostPort = {
    now: () => 1_700_000_000_000,
    credentials: {
      getOAuthToken: async () => undefined,
      getSecret: async () => undefined,
    },
    http: { request: vi.fn<HostPort["http"]["request"]>() },
  };

  function makeService(localCollectors: LocalUsageCollector[]): UsageService {
    return new UsageService({
      cachePath: join(cacheDir, "usage.json"),
      emit: () => {},
      host,
      providerIds: localCollectors.map((collector) => collector.id),
      profileSources: () => [],
      localCollectors,
    });
  }

  beforeEach(() => {
    mkdirSync("tmp", { recursive: true });
    cacheDir = mkdtempSync(join("tmp", "usage-authorization-"));
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    resetMacKeychainStateForTests();
    security.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("retries denied access on forced refresh while ordinary polling stays suppressed", async () => {
    const collect = async (): Promise<UsageSnapshot> => {
      const token = await readMacKeychainPassword({ service: "fixture-login", account: "user" });
      return {
        providerId: "fixture",
        status: token ? "ok" : "auth-missing",
        windows: [],
        fetchedAt: host.now(),
      };
    };
    const service = makeService([{ id: "fixture", collect }]);
    security.mockRejectedValueOnce(Object.assign(new Error("Canceled"), { code: 128 }));
    expect((await service.refreshProviderUsage({})).snapshots[0]?.status).toBe("auth-missing");
    security.mockResolvedValue({ stdout: "new-login-token" });
    expect((await service.refreshProviderUsage({})).snapshots[0]?.status).toBe("auth-missing");
    expect(security).toHaveBeenCalledOnce();
    expect((await service.refreshProviderUsage({ force: true })).snapshots[0]?.status).toBe("ok");
    expect(security).toHaveBeenCalledTimes(2);
    expect((await service.refreshProviderUsage({})).snapshots[0]?.status).toBe("ok");
    expect(security).toHaveBeenCalledTimes(3);
    expect(host.http.request).not.toHaveBeenCalled();
  });

  it("drains overlapping batches before a forced subset retries a coalesced credential read", async () => {
    const pending = Promise.withResolvers<{ stdout: string }>();
    security.mockReturnValueOnce(pending.promise).mockResolvedValue({ stdout: "new-login-token" });
    const credentialReads = new Map<string, Promise<string | undefined>>();
    const collect = async (): Promise<UsageSnapshot> => {
      // Provider credential caches coalesce above the shared Keychain reader.
      const token = await coalesceByKey(credentialReads, "login", () =>
        readMacKeychainPassword({ service: "fixture-login", account: "user" }),
      );
      return {
        providerId: "fixture",
        status: token ? "ok" : "auth-missing",
        windows: [],
        fetchedAt: host.now(),
      };
    };
    const other: UsageSnapshot = {
      providerId: "other",
      status: "ok",
      windows: [],
      fetchedAt: host.now(),
    };
    const service = makeService([
      { id: "fixture", collect },
      { id: "other", collect: async () => other },
    ]);
    const background = service.refreshProviderUsage({});
    await vi.waitFor(() => expect(security).toHaveBeenCalledOnce());
    const forced = service.refreshProviderUsage({ providerIds: ["fixture"], force: true });
    pending.reject(Object.assign(new Error("Canceled"), { code: 128 }));
    const backgroundResult = await background;
    expect(backgroundResult.snapshots.find((s) => s.providerId === "fixture")?.status).toBe(
      "auth-missing",
    );
    expect((await forced).snapshots[0]?.status).toBe("ok");
    expect(security).toHaveBeenCalledTimes(2);
  });

  it("does not wait for an unrelated provider's collection on forced refresh", async () => {
    const pending = Promise.withResolvers<UsageSnapshot>();
    const started = Promise.withResolvers<void>();
    const service = makeService([
      {
        id: "fixture",
        collect: async () => ({
          providerId: "fixture",
          status: "ok",
          windows: [],
          fetchedAt: host.now(),
        }),
      },
      {
        id: "other",
        collect: () => {
          started.resolve();
          return pending.promise;
        },
      },
    ]);
    const background = service.refreshProviderUsage({ providerIds: ["other"] });
    await started.promise;
    try {
      const forced = await service.refreshProviderUsage({ providerIds: ["fixture"], force: true });
      expect(forced.snapshots[0]?.status).toBe("ok");
    } finally {
      pending.resolve({ providerId: "other", status: "ok", windows: [], fetchedAt: host.now() });
      await background;
    }
  });

  it("preserves a pre-upgrade cache and emits nothing when shutdown interrupts collection", async () => {
    const cachePath = join(cacheDir, "usage.json");
    const saved = JSON.stringify({
      version: 10,
      snapshots: [
        {
          providerId: "fixture",
          status: "ok",
          windows: [],
          fetchedAt: host.now(),
        },
      ],
    });
    writeFileSync(cachePath, saved);
    const pending = Promise.withResolvers<UsageSnapshot>();
    const started = Promise.withResolvers<void>();
    const emit = vi.fn<() => void>();
    const collect = vi.fn<() => Promise<UsageSnapshot>>(() => {
      started.resolve();
      return pending.promise;
    });
    const service = new UsageService({
      cachePath,
      emit,
      host,
      providerIds: ["fixture"],
      profileSources: () => [],
      localCollectors: [{ id: "fixture", collect }],
    });
    const background = service.refreshProviderUsage({});
    await started.promise;
    const forced = service.refreshProviderUsage({ providerIds: ["fixture"], force: true });
    service.stop();
    pending.resolve({
      providerId: "fixture",
      status: "auth-missing",
      windows: [],
      fetchedAt: host.now(),
    });
    await expect(background).resolves.toEqual({ snapshots: [], fromCache: false });
    await expect(forced).resolves.toEqual({ snapshots: [], fromCache: false });
    await expect(service.refreshProviderUsage({ force: true })).resolves.toEqual({
      snapshots: [],
      fromCache: false,
    });
    expect(collect).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
    expect(readFileSync(cachePath, "utf8")).toBe(saved);
  });
});
