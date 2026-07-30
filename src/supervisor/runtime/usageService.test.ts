import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostPort, OAuthToken, UsageSnapshot } from "@poracode/agents-usage";
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

const CODEX_BODY = JSON.stringify({
  plan_type: "plus",
  rate_limit: {
    primary_window: { used_percent: 30, window_minutes: 300 },
    secondary_window: { used_percent: 10, window_minutes: 10_080 },
  },
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
  const path = join(tmpdir(), `poracode-usage-test-${process.pid}-${cachePaths.length}.json`);
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
  it("refresh defaults to Claude and Codex only, emits per-provider then a terminal event", async () => {
    const events: SupervisorEvent[] = [];
    const service = new UsageService({
      emit: (event) => events.push(event),
      cachePath: tempCachePath(),
      host: makeHost({ claude: { accessToken: "tok" } }),
      localCollectors: stubLocalCollectors(),
    });

    const result = await service.refreshProviderUsage({});
    expect(result.fromCache).toBe(false);
    expect(result.snapshots.map((s) => s.providerId).sort()).toEqual(["claude", "codex"]);

    const claude = result.snapshots.find((s) => s.providerId === "claude");
    expect(claude?.status).toBe("ok");
    expect(claude?.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(0.4);
    // No token → auth-missing, no endpoint hit.
    expect(result.snapshots.find((s) => s.providerId === "codex")?.status).toBe("auth-missing");

    const perProvider = events.filter((e) => e.type === "provider-usage");
    const terminal = events.filter((e) => e.type === "provider-usage-all");
    expect(perProvider).toHaveLength(result.snapshots.length);
    expect(terminal).toHaveLength(1);
  });

  it("keeps all providers enabled for existing settings with no usage opt-outs", async () => {
    const settingsPath = tempCachePath();
    writeFileSync(settingsPath, JSON.stringify({ usage: { autoRefresh: true } }), "utf8");
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host: makeHost({ claude: { accessToken: "tok" } }),
      localCollectors: stubLocalCollectors(),
    });

    const result = await service.refreshProviderUsage({});

    expect(result.snapshots.map((s) => s.providerId).sort()).toEqual([
      "antigravity",
      "claude",
      "codex",
      "commandcode",
      "copilot",
      "cursor",
      "factory",
      "gemini",
      "grok",
      "opencode",
      "zai",
    ]);
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

  it("auto-refreshes each provider on its own per-provider cadence", async () => {
    let now = NOW;
    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        usage: {
          autoRefresh: true,
          refreshIntervalMinutes: 10,
          providerRefreshIntervals: { claude: 2 },
        },
      }),
      "utf8",
    );
    const host: HostPort = {
      now: () => now,
      credentials: {
        getOAuthToken: (id) =>
          Promise.resolve(
            id === "claude" || id === "codex" ? { accessToken: `${id}-tok` } : undefined,
          ),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: () => Promise.resolve({ status: 200, headers: {}, body: CLAUDE_BODY }),
      },
    };
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host,
      providerIds: ["claude", "codex"],
    });

    // Seed both snapshots at NOW.
    await service.refreshProviderUsage({});

    // +2min: only Claude (2-min override) is due; Codex (10-min default) is not.
    now = NOW + 2 * 60_000;
    expect(await service.refreshDueProviders()).toEqual(["claude"]);

    // +10min: both are due — Claude again on its faster clock, Codex for the first time.
    now = NOW + 10 * 60_000;
    expect((await service.refreshDueProviders()).sort()).toEqual(["claude", "codex"]);
  });

  it("auto-refresh respects the global off switch even with per-provider intervals", async () => {
    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        usage: { autoRefresh: false, providerRefreshIntervals: { claude: 2 } },
      }),
      "utf8",
    );
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host: makeHost({ claude: { accessToken: "tok" } }),
      providerIds: ["claude", "codex"],
    });
    expect(await service.refreshDueProviders()).toEqual([]);
  });

  it("collects Claude profile usage from the profile config directory", async () => {
    const profileDir = join(tmpdir(), `poracode-usage-claude-profile-${process.pid}`);
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

  it("collects Codex profile usage from the isolated profile home", async () => {
    const profileDir = join(tmpdir(), `poracode-usage-codex-profile-${process.pid}`);
    cachePaths.push(profileDir);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, "auth.json"),
      JSON.stringify({ tokens: { access_token: "profile-token", account_id: "profile-account" } }),
      "utf8",
    );

    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentInstances: {
          work: {
            id: "work",
            driver: "codex",
            displayName: "Work",
            config: { homeDir: profileDir },
          },
        },
      }),
      "utf8",
    );

    let authorization: string | undefined;
    let accountId: string | undefined;
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: () => Promise.resolve(undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: (request) => {
          authorization = request.headers?.Authorization;
          accountId = request.headers?.["ChatGPT-Account-Id"];
          return Promise.resolve({ status: 200, headers: {}, body: CODEX_BODY });
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

    const result = await service.refreshProviderUsage({ providerIds: ["codex:work"] });

    expect(authorization).toBe("Bearer profile-token");
    expect(accountId).toBe("profile-account");
    expect(result.snapshots[0]).toMatchObject({
      providerId: "codex:work",
      status: "ok",
      plan: "ChatGPT Plus",
    });
  });

  it("does not re-poll a rate-limited provider until its Retry-After backoff clears", async () => {
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
          // 30-minute Retry-After, far beyond the 2-minute refresh floor.
          return Promise.resolve({
            status: 429,
            headers: { "retry-after": "1800" },
            body: "{}",
          });
        },
      },
    };
    const service = new UsageService({ emit: () => {}, cachePath: tempCachePath(), host });

    await service.refreshProviderUsage({ providerIds: ["claude"] });
    expect(calls).toBe(1);

    // +5 min: past the 2-min floor but inside the 30-min backoff — no re-poll.
    now = NOW + 5 * 60_000;
    await service.getProviderUsage({ providerIds: ["claude"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);

    // +31 min: the backoff has cleared, so a cache read kicks off a refresh.
    now = NOW + 31 * 60_000;
    await service.getProviderUsage({ providerIds: ["claude"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBeGreaterThan(1);
  });

  it("preserves last-good windows on a 429 while still carrying the backoff", async () => {
    let now = NOW;
    let status = 200;
    const host: HostPort = {
      now: () => now,
      credentials: {
        getOAuthToken: (id) =>
          Promise.resolve(id === "claude" ? { accessToken: "tok" } : undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: () =>
          Promise.resolve(
            status === 200
              ? { status: 200, headers: {}, body: CLAUDE_BODY }
              : { status: 429, headers: { "retry-after": "1800" }, body: "{}" },
          ),
      },
    };
    const service = new UsageService({ emit: () => {}, cachePath: tempCachePath(), host });

    await service.refreshProviderUsage({ providerIds: ["claude"] });
    status = 429;
    now = NOW + 3 * 60_000;
    await service.refreshProviderUsage({ providerIds: ["claude"] });

    const cached = await service.getProviderUsage({ providerIds: ["claude"] });
    const snap = cached.snapshots.find((s) => s.providerId === "claude");
    // Last good windows survive the transient 429...
    expect(snap?.status).toBe("rate-limited");
    expect(snap?.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(0.4);
    // ...and the new backoff deadline is carried so polling stays gated.
    expect(snap?.rateLimitedUntil).toBe(NOW + 3 * 60_000 + 1800 * 1000);
  });

  it("keeps last-good Claude usage when an idle auth probe reports missing auth", async () => {
    let now = NOW;
    let token: OAuthToken | undefined = { accessToken: "tok" };
    const host: HostPort = {
      now: () => now,
      credentials: {
        getOAuthToken: (id) => Promise.resolve(id === "claude" ? token : undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: () => Promise.resolve({ status: 200, headers: {}, body: CLAUDE_BODY }),
      },
    };
    const service = new UsageService({ emit: () => {}, cachePath: tempCachePath(), host });

    await service.refreshProviderUsage({ providerIds: ["claude"] });
    token = undefined;
    now = NOW + 3 * 60_000;
    const refreshed = await service.refreshProviderUsage({ providerIds: ["claude"] });
    const snap = refreshed.snapshots.find((s) => s.providerId === "claude");

    expect(snap?.status).toBe("ok");
    expect(snap?.fetchedAt).toBe(NOW);
    expect(snap?.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(0.4);
  });

  it("still reports first-time Claude auth-missing when there is no last-good usage", async () => {
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host: makeHost({}),
    });

    const refreshed = await service.refreshProviderUsage({ providerIds: ["claude"] });

    expect(refreshed.snapshots[0]).toMatchObject({
      providerId: "claude",
      status: "auth-missing",
      windows: [],
    });
  });

  it("does not preserve auth-missing for non-Claude providers", async () => {
    let authenticated = true;
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host: makeHost({}),
      localCollectors: [
        {
          id: "opencode",
          collect: (nowMs): Promise<UsageSnapshot> =>
            Promise.resolve(
              authenticated
                ? {
                    providerId: "opencode",
                    status: "ok",
                    windows: [
                      {
                        id: "monthly",
                        label: "Monthly",
                        usedPercent: 42,
                        unit: "percent",
                      },
                    ],
                    fetchedAt: nowMs,
                  }
                : {
                    providerId: "opencode",
                    status: "auth-missing",
                    windows: [],
                    fetchedAt: nowMs,
                  },
            ),
        },
      ],
    });

    await service.refreshProviderUsage({ providerIds: ["opencode"] });
    authenticated = false;
    const refreshed = await service.refreshProviderUsage({ providerIds: ["opencode"] });

    expect(refreshed.snapshots[0]).toMatchObject({
      providerId: "opencode",
      status: "auth-missing",
      windows: [],
    });
  });

  it("applies the default cooldown when preserving a bare rate-limited snapshot", async () => {
    let now = NOW;
    let calls = 0;
    let rateLimited = false;
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host: {
        now: () => now,
        credentials: {
          getOAuthToken: () => Promise.resolve(undefined),
          getSecret: () => Promise.resolve(undefined),
        },
        http: {
          request: () => Promise.resolve({ status: 200, headers: {}, body: "{}" }),
        },
      },
      localCollectors: [
        {
          id: "opencode",
          collect: (nowMs): Promise<UsageSnapshot> => {
            calls += 1;
            return Promise.resolve(
              rateLimited
                ? { providerId: "opencode", status: "rate-limited", windows: [], fetchedAt: nowMs }
                : {
                    providerId: "opencode",
                    status: "ok",
                    windows: [
                      {
                        id: "monthly",
                        label: "Monthly",
                        usedPercent: 42,
                        unit: "percent",
                      },
                    ],
                    fetchedAt: nowMs,
                  },
            );
          },
        },
      ],
    });

    await service.refreshProviderUsage({ providerIds: ["opencode"] });
    rateLimited = true;
    now = NOW + 3 * 60_000;
    await service.refreshProviderUsage({ providerIds: ["opencode"] });
    expect(calls).toBe(2);

    now = NOW + 7 * 60_000;
    await service.getProviderUsage({ providerIds: ["opencode"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(2);

    now = NOW + 9 * 60_000;
    await service.getProviderUsage({ providerIds: ["opencode"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBeGreaterThan(2);
  });
});
