import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allUsageProviderDescriptors,
  type HostPort,
  type UsageSnapshot,
} from "@poracode/agents-usage";
import { UsageService, type UsageServiceOptions } from "./usageService";
import type { SupervisorEvent } from "@/shared/ipc";
import type { LocalUsageCollector } from "./localUsageCollectors";

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(collectionEnabled?: boolean, cacheVersion = 8) {
  const directory = mkdtempSync(join(tmpdir(), "poracode-usage-isolation-"));
  directories.push(directory);
  const cachePath = join(directory, "provider-usage.json");
  const snapshot: UsageSnapshot = {
    providerId: "fixture",
    status: "auth-missing",
    windows: [],
    fetchedAt: 1_700_000_000_000,
  };
  const cache = JSON.stringify({ version: cacheVersion, snapshots: [snapshot] });
  writeFileSync(cachePath, cache);
  const getOAuthToken = vi.fn<HostPort["credentials"]["getOAuthToken"]>(async () => undefined);
  const getSecret = vi.fn<HostPort["credentials"]["getSecret"]>(async () => undefined);
  const refreshOAuthToken = vi.fn<NonNullable<HostPort["credentials"]["refreshOAuthToken"]>>(
    async () => undefined,
  );
  const setSecret = vi.fn<NonNullable<HostPort["credentials"]["setSecret"]>>(async () => {});
  const request = vi.fn<HostPort["http"]["request"]>(async () => ({
    status: 200,
    headers: {},
    body: "{}",
  }));
  const now = vi.fn<HostPort["now"]>(() => snapshot.fetchedAt);
  const host: HostPort = {
    now,
    credentials: { getOAuthToken, getSecret, refreshOAuthToken, setSecret },
    http: { request },
  };
  const collect = vi.fn<LocalUsageCollector["collect"]>(async () => snapshot);
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const profileSources = vi.fn<NonNullable<UsageServiceOptions["profileSources"]>>(() => []);
  const service = new UsageService({
    cachePath,
    host,
    emit,
    providerIds: ["fixture"],
    localCollectors: [{ id: "fixture", collect }],
    profileSources,
    ...(collectionEnabled === undefined ? {} : { collectionEnabled }),
  });
  return {
    service,
    cachePath,
    cache,
    collect,
    emit,
    profileSources,
    getOAuthToken,
    getSecret,
    refreshOAuthToken,
    setSecret,
    request,
    now,
  };
}

describe("disabled isolated usage collection", () => {
  it.each([8, 10])(
    "blocks collection and profile reconciliation with cache version %s",
    async (cacheVersion) => {
      const f = fixture(false, cacheVersion);
      const providerIds = [
        ...allUsageProviderDescriptors().map((provider) => provider.id),
        "fixture",
      ];
      expect(await f.service.getProviderUsage({ providerIds })).toEqual({
        snapshots: [],
        fromCache: false,
      });
      expect(await f.service.refreshProviderUsage({ providerIds, force: true })).toEqual({
        snapshots: [],
        fromCache: false,
      });
      expect(await f.service.refreshDueProviders()).toEqual([]);
      await f.service.reconcileProfileSources();
      for (const spy of [
        f.collect,
        f.emit,
        f.profileSources,
        f.getOAuthToken,
        f.getSecret,
        f.refreshOAuthToken,
        f.setSecret,
        f.request,
        f.now,
      ]) {
        expect(spy).not.toHaveBeenCalled();
      }
      expect(readFileSync(f.cachePath, "utf8")).toBe(f.cache);
      f.service.stop();
    },
  );

  it("does not schedule polling, including repeated starts", () => {
    vi.useFakeTimers();
    const f = fixture(false);
    f.service.startAutoRefresh();
    f.service.startAutoRefresh();
    expect(vi.getTimerCount()).toBe(0);
    f.service.stop();
  });

  it.each([undefined, true])(
    "retains existing cached reads and refreshes when enabled=%s",
    async (enabled) => {
      const f = fixture(enabled, 10);
      expect(await f.service.getProviderUsage({})).toMatchObject({
        fromCache: true,
        snapshots: [{ providerId: "fixture" }],
      });
      await f.service.refreshProviderUsage({ force: true });
      expect(f.collect).toHaveBeenCalledOnce();
      expect(f.emit).toHaveBeenCalled();
      f.service.stop();
    },
  );
});
