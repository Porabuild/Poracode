import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostPort, OAuthToken, UsageSnapshot } from "@lightcode/agents-usage";
import type { SupervisorEvent } from "@/shared/ipc";
import type { LocalUsageCollector } from "./localUsageCollectors";
import { UsageService } from "./usageService";

const NOW = 1_700_000_000_000;

/**
 * Stub the supervisor-local collectors so unit tests never touch disk or spawn a
 * process (opencode reads SQLite, antigravity probes a language server). Each
 * returns auth-missing.
 */
function stubLocalCollectors(): LocalUsageCollector[] {
  const stub = (id: string): LocalUsageCollector => ({
    id,
    collect: (nowMs): Promise<UsageSnapshot> =>
      Promise.resolve({ providerId: id, status: "auth-missing", windows: [], fetchedAt: nowMs }),
  });
  return [stub("opencode"), stub("antigravity")];
}

const CLAUDE_BODY = JSON.stringify({
  five_hour: { utilization: 0.4, resets_at: "2026-05-29T12:00:00Z" },
  seven_day: { utilization: 0.1 },
});

function makeHost(tokens: Record<string, OAuthToken | undefined>): HostPort {
  return {
    now: () => NOW,
    credentials: {
      getOAuthToken: (id) => Promise.resolve(tokens[id]),
      getSecret: () => Promise.resolve(undefined),
    },
    http: {
      request: () => Promise.resolve({ status: 200, headers: {}, body: CLAUDE_BODY }),
    },
  };
}

const cachePaths: string[] = [];
function tempCachePath(): string {
  const path = join(tmpdir(), `lightcode-usage-test-${process.pid}-${cachePaths.length}.json`);
  cachePaths.push(path);
  return path;
}

afterEach(() => {
  for (const path of cachePaths.splice(0)) {
    try {
      rmSync(path, { force: true, recursive: true });
    } catch {
      // ignore
    }
  }
});

describe("UsageService", () => {
  it("refresh collects all providers, emits per-provider then a terminal event", async () => {
    const events: SupervisorEvent[] = [];
    const service = new UsageService({
      emit: (event) => events.push(event),
      cachePath: tempCachePath(),
      host: makeHost({ claude: { accessToken: "tok" } }),
      localCollectors: stubLocalCollectors(),
    });

    const result = await service.refreshProviderUsage({});
    expect(result.fromCache).toBe(false);
    expect(result.snapshots.map((s) => s.providerId).sort()).toEqual([
      "antigravity",
      "claude",
      "codex",
      "commandcode",
      "copilot",
      "cursor",
      "gemini",
      "grok",
      "opencode",
    ]);

    const claude = result.snapshots.find((s) => s.providerId === "claude");
    expect(claude?.status).toBe("ok");
    expect(claude?.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(0.4);
    // No token → auth-missing, no endpoint hit.
    expect(result.snapshots.find((s) => s.providerId === "codex")?.status).toBe("auth-missing");

    const perProvider = events.filter((e) => e.type === "provider-usage");
    const terminal = events.filter((e) => e.type === "provider-usage-all");
    expect(perProvider).toHaveLength(9);
    expect(terminal).toHaveLength(1);
  });

  it("getProviderUsage returns cached snapshots after a refresh", async () => {
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host: makeHost({ claude: { accessToken: "tok" } }),
      localCollectors: stubLocalCollectors(),
    });
    await service.refreshProviderUsage({});
    const cached = await service.getProviderUsage({ providerIds: ["claude"] });
    expect(cached.snapshots).toHaveLength(1);
    expect(cached.snapshots[0]?.providerId).toBe("claude");
  });

  it("does not trigger cache-read refreshes inside the 2-minute rate-limit floor", async () => {
    let now = NOW;
    let calls = 0;
    const host: HostPort = {
      now: () => now,
      credentials: {
        getOAuthToken: (id) =>
          Promise.resolve(id === "claude" ? { accessToken: "tok" } : undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: () => {
          calls += 1;
          return Promise.resolve({ status: 200, headers: {}, body: CLAUDE_BODY });
        },
      },
    };
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host,
    });
    await service.refreshProviderUsage({ providerIds: ["claude"] });
    const afterRefresh = calls;

    now += 119_999;
    await service.getProviderUsage({ providerIds: ["claude"] });
    expect(calls).toBe(afterRefresh);

    now += 1;
    await service.getProviderUsage({ providerIds: ["claude"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBeGreaterThan(afterRefresh);
  });

  it("emits all cached snapshots after a targeted refresh", async () => {
    const events: SupervisorEvent[] = [];
    const service = new UsageService({
      emit: (event) => events.push(event),
      cachePath: tempCachePath(),
      host: makeHost({
        claude: { accessToken: "claude-token" },
        codex: { accessToken: "codex-token" },
      }),
    });

    await service.refreshProviderUsage({ providerIds: ["claude"] });
    await service.refreshProviderUsage({ providerIds: ["codex"] });

    const terminalEvents = events.filter((e) => e.type === "provider-usage-all");
    expect(
      terminalEvents
        .at(-1)
        ?.snapshots.map((s) => s.providerId)
        .sort(),
    ).toEqual(["claude", "codex"]);
  });

  it("re-fetches on every refresh (does not pin the first result)", async () => {
    let calls = 0;
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: (id) =>
          Promise.resolve(id === "claude" ? { accessToken: "tok" } : undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: () => {
          calls += 1;
          return Promise.resolve({ status: 200, headers: {}, body: CLAUDE_BODY });
        },
      },
    };
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host,
      localCollectors: stubLocalCollectors(),
    });
    await service.refreshProviderUsage({});
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);
    await service.refreshProviderUsage({});
    expect(calls).toBeGreaterThan(afterFirst);
  });

  it("ignores unknown provider ids", async () => {
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host: makeHost({}),
    });
    const result = await service.refreshProviderUsage({ providerIds: ["ghost"] });
    expect(result.snapshots).toHaveLength(0);
  });

  it("collects Claude profile usage from the profile config directory", async () => {
    const profileDir = join(tmpdir(), `lightcode-usage-claude-profile-${process.pid}`);
    cachePaths.push(profileDir);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "profile-token",
          subscriptionType: "team",
        },
      }),
      "utf8",
    );

    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentInstances: {
          home: {
            id: "home",
            driver: "claude",
            displayName: "Home",
            config: { configDir: profileDir },
          },
        },
      }),
      "utf8",
    );

    let authorization: string | undefined;
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: () => Promise.resolve(undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: (request) => {
          authorization = request.headers?.Authorization;
          return Promise.resolve({ status: 200, headers: {}, body: CLAUDE_BODY });
        },
      },
    };
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host,
      localCollectors: stubLocalCollectors(),
    });

    const result = await service.refreshProviderUsage({ providerIds: ["claude:home"] });

    expect(authorization).toBe("Bearer profile-token");
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({
      providerId: "claude:home",
      status: "ok",
      plan: "Team Subscription",
    });
    expect(result.snapshots[0]?.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(0.4);
  });
});
