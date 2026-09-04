import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CURSOR_API_KEY_EXCHANGE_ENDPOINT,
  CURSOR_PERIOD_USAGE_ENDPOINT,
  CURSOR_PLAN_INFO_ENDPOINT,
  type HostPort,
  type OAuthToken,
  type UsageSnapshot,
} from "@poracode/agents-usage";
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
  it("discards older caches that still label the first-party window Auto + Composer", async () => {
    const cachePath = tempCachePath();
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 4,
        snapshots: [
          {
            providerId: "cursor",
            status: "ok",
            windows: [{ id: "cursor-auto", label: "Auto + Composer", usedPercent: 34 }],
            fetchedAt: NOW,
          },
        ],
      }),
    );
    const service = new UsageService({
      emit: () => {},
      cachePath,
      host: makeHost({}),
      localCollectors: stubLocalCollectors(),
    });

    const result = await service.getProviderUsage({ providerIds: ["cursor"] });
    expect(result.fromCache).toBe(false);
    expect(result.snapshots).toEqual([]);
  });

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
      "kimi",
      "muse",
      "opencode",
      "qoder",
      "qwen",
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

  it("hides estimated local cost unless the setting is enabled", async () => {
    const settingsPath = tempCachePath();
    writeFileSync(settingsPath, JSON.stringify({ usage: { showEstimatedCost: false } }), "utf8");
    const localCollectors: LocalUsageCollector[] = [
      {
        id: "antigravity",
        collect: async (nowMs) => ({
          providerId: "antigravity",
          status: "ok",
          windows: [],
          cost: { currency: "USD", amount: 1, period: "30d", estimated: true },
          tokens: { total: 100, input: 90, output: 10, period: "30d" },
          fetchedAt: nowMs,
        }),
      },
    ];
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host: makeHost({}),
      providerIds: ["antigravity"],
      localCollectors,
    });

    const hidden = await service.refreshProviderUsage({});
    expect(hidden.snapshots[0]?.cost).toBeUndefined();
    expect(hidden.snapshots[0]?.tokens?.total).toBe(100);

    writeFileSync(settingsPath, JSON.stringify({ usage: { showEstimatedCost: true } }), "utf8");
    const visible = await service.refreshProviderUsage({});
    expect(visible.snapshots[0]?.cost?.amount).toBe(1);

    // Toggling visibility takes effect immediately from the in-memory cache.
    writeFileSync(settingsPath, JSON.stringify({ usage: { showEstimatedCost: false } }), "utf8");
    const cached = await service.getProviderUsage({ providerIds: ["antigravity"] });
    expect(cached.snapshots).toHaveLength(1);
    expect(cached.snapshots[0]?.cost).toBeUndefined();

    writeFileSync(settingsPath, JSON.stringify({ usage: { showEstimatedCost: true } }), "utf8");
    const reenabled = await service.getProviderUsage({ providerIds: ["antigravity"] });
    expect(reenabled.snapshots[0]?.cost?.amount).toBe(1);
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

  it("force refresh drains an in-flight collection then recollects with new credentials", async () => {
    let secret: string | undefined;
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let collectCalls = 0;
    const localCollectors: LocalUsageCollector[] = [
      {
        id: "opencode",
        collect: async (nowMs) => {
          collectCalls += 1;
          // First collection started before the key was stored; hold it open so
          // a concurrent force refresh must wait rather than join its result.
          if (collectCalls === 1) {
            await firstGate;
            // Snapshot the credential at the start of the first collect so a
            // mid-flight key paste is not retroactively applied.
            return {
              providerId: "opencode",
              status: "auth-missing",
              windows: [],
              fetchedAt: nowMs,
            };
          }
          return secret
            ? {
                providerId: "opencode",
                status: "ok",
                plan: "Go",
                windows: [{ id: "weekly", label: "Weekly", usedPercent: 10, resetsAt: nowMs + 1 }],
                fetchedAt: nowMs,
              }
            : {
                providerId: "opencode",
                status: "auth-missing",
                windows: [],
                fetchedAt: nowMs,
              };
        },
      },
    ];
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      host: makeHost({}),
      providerIds: ["opencode"],
      localCollectors,
    });

    const stale = service.refreshProviderUsage({ providerIds: ["opencode"] });
    // Let the stale collection reach the credential gate.
    await new Promise((resolve) => setTimeout(resolve, 0));
    secret = "sk-live";
    const forced = service.refreshProviderUsage({ providerIds: ["opencode"], force: true });
    releaseFirst?.();

    const staleResult = await stale;
    const forcedResult = await forced;
    expect(staleResult.snapshots[0]?.status).toBe("auth-missing");
    expect(forcedResult.snapshots[0]?.status).toBe("ok");
    expect(collectCalls).toBe(2);
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

  it("collects Cursor profile usage from the profile API key", async () => {
    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentInstances: {
          work: {
            id: "work",
            driver: "cursor",
            displayName: "Work",
            environment: { CURSOR_API_KEY: { value: "crsr_work", sensitive: true } },
          },
        },
      }),
      "utf8",
    );

    const urls: string[] = [];
    const authorizations: Array<string | undefined> = [];
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: () => Promise.resolve(undefined),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: (request) => {
          urls.push(request.url);
          authorizations.push(request.headers?.Authorization);
          if (request.url === CURSOR_API_KEY_EXCHANGE_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({ accessToken: "session-jwt" }),
            });
          }
          if (request.url === CURSOR_PERIOD_USAGE_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({
                planUsage: {
                  totalSpend: 2000,
                  limit: 2000,
                  autoPercentUsed: 10,
                  apiPercentUsed: 40,
                },
              }),
            });
          }
          if (request.url === CURSOR_PLAN_INFO_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({ planInfo: { planName: "pro" } }),
            });
          }
          return Promise.resolve({ status: 404, headers: {}, body: "" });
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

    const result = await service.refreshProviderUsage({ providerIds: ["cursor:work"] });

    expect(urls[0]).toBe(CURSOR_API_KEY_EXCHANGE_ENDPOINT);
    expect(authorizations[0]).toBe("Bearer crsr_work");
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({
      providerId: "cursor:work",
      status: "ok",
      plan: "Cursor Pro",
    });
    expect(result.snapshots[0]?.windows.find((w) => w.id === "cursor-auto")?.usedPercent).toBe(10);
  });

  it("uses the main Cursor SDK API key instead of the machine CLI login", async () => {
    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({ agentSettings: { cursor: { sdkApiKey: "crsr_personal" } } }),
      "utf8",
    );

    const urls: string[] = [];
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        getOAuthToken: () => Promise.resolve({ accessToken: "cli-enterprise-session" }),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: (request) => {
          urls.push(request.url);
          if (request.url === CURSOR_API_KEY_EXCHANGE_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({
                accessToken: "header.eyJlbWFpbCI6InBlcnNvbmFsQGV4YW1wbGUuY29tIn0.sig",
              }),
            });
          }
          if (request.url === CURSOR_PERIOD_USAGE_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({
                planUsage: {
                  totalSpend: 1200,
                  limit: 2000,
                  autoPercentUsed: 6,
                  apiPercentUsed: 12,
                },
              }),
            });
          }
          if (request.url === CURSOR_PLAN_INFO_ENDPOINT) {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({ planInfo: { planName: "pro" } }),
            });
          }
          return Promise.resolve({
            status: 200,
            headers: {},
            body: JSON.stringify({ membershipType: "enterprise" }),
          });
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

    const result = await service.refreshProviderUsage({ providerIds: ["cursor"] });

    expect(urls).toEqual([
      CURSOR_API_KEY_EXCHANGE_ENDPOINT,
      CURSOR_PERIOD_USAGE_ENDPOINT,
      CURSOR_PLAN_INFO_ENDPOINT,
    ]);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({
      providerId: "cursor",
      status: "ok",
      plan: "Cursor Pro",
      authenticatedAs: "personal@example.com",
    });
    expect(result.snapshots[0]?.windows.find((w) => w.id === "cursor-auto")?.usedPercent).toBe(6);
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
