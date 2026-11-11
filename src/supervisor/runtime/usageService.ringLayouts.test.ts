import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import { UsageService } from "./usageService";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const now = 1_800_000_000_000;
const snapshot: UsageSnapshot = {
  providerId: "antigravity",
  status: "ok",
  fetchedAt: now,
  windows: [
    { id: "antigravity:gemini:session-5h", label: "Gemini · 5h", usedPercent: 0 },
    { id: "antigravity:claude:weekly", label: "Claude · Weekly", usedPercent: 90 },
  ],
};
const host: HostPort = {
  now: () => now,
  credentials: { getOAuthToken: async () => undefined, getSecret: async () => undefined },
  http: {
    request: async () => {
      throw new Error("Unexpected network request in ring metadata test");
    },
  },
};
function setup() {
  const root = mkdtempSync(join(tmpdir(), "poracode-ring-layouts-"));
  roots.push(root);
  const cachePath = join(root, "usage.json");
  const settingsPath = join(root, "settings.json");
  const select = (group: string) =>
    writeFileSync(
      settingsPath,
      JSON.stringify({ usage: { selectedRingGroups: { antigravity: group } } }),
    );
  return { cachePath, settingsPath, select };
}

describe("response-only ring layouts across cache and settings generations", () => {
  it("recomputes selected IDs from a current v16 cache without migrating it", async () => {
    const { cachePath, settingsPath, select } = setup();
    writeFileSync(cachePath, JSON.stringify({ version: 16, snapshots: [snapshot] }));
    select("gemini");
    const collect = vi.fn<() => Promise<UsageSnapshot>>(async () => snapshot);
    const service = new UsageService({
      emit: () => {},
      cachePath,
      settingsPath,
      host,
      providerIds: ["antigravity"],
      localCollectors: [{ id: "antigravity", collect }],
    });
    try {
      expect((await service.getProviderUsage({})).ringLayouts).toEqual({
        antigravity: { outerWindowId: "antigravity:gemini:session-5h" },
      });
      select("claude");
      const next = await service.getProviderUsage({});
      expect(next.fromCache).toBe(true);
      expect(next.ringLayouts).toEqual({
        antigravity: { outerWindowId: "antigravity:claude:weekly" },
      });
      expect(collect).not.toHaveBeenCalled();
      expect(JSON.parse(readFileSync(cachePath, "utf8"))).toEqual({
        version: 16,
        snapshots: [snapshot],
      });
    } finally {
      service.stop();
    }
  });

  it("uses the latest selection when collection spans a settings change", async () => {
    const { cachePath, settingsPath, select } = setup();
    select("gemini");
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const collect = vi.fn<() => Promise<UsageSnapshot>>(async () => {
      await pending;
      return snapshot;
    });
    const service = new UsageService({
      emit: () => {},
      cachePath,
      settingsPath,
      host,
      providerIds: ["antigravity"],
      localCollectors: [{ id: "antigravity", collect }],
    });
    try {
      const refresh = service.refreshProviderUsage({});
      await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce());
      select("claude");
      finish();
      expect((await refresh).ringLayouts).toEqual({
        antigravity: { outerWindowId: "antigravity:claude:weekly" },
      });
    } finally {
      finish();
      service.stop();
    }
  });
});
