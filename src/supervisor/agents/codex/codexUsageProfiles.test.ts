import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostPort } from "@poracode/agents-usage";
import { UsageService } from "../../runtime/usageService";
const NOW = 1_700_000_000_000;
const cachePaths: string[] = [];
function tempCachePath(): string {
  const path = join(tmpdir(), `codex-profile-usage-test-${process.pid}-${cachePaths.length}.json`);
  cachePaths.push(path);
  return path;
}
afterEach(() => {
  for (const path of cachePaths.splice(0)) rmSync(path, { recursive: true, force: true });
});
describe("Codex profile usage", () => {
  it("collects Codex profile usage from the profile CODEX_HOME", async () => {
    const homeDir = join(tmpdir(), `poracode-usage-codex-profile-${process.pid}`);
    cachePaths.push(homeDir);
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(
      join(homeDir, "auth.json"),
      JSON.stringify({ tokens: { access_token: "profile-codex-jwt", account_id: "acct-work" } }),
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
            config: { homeDir },
          },
        },
      }),
      "utf8",
    );

    let authorization: string | undefined;
    const host: HostPort = {
      now: () => NOW,
      credentials: {
        // The global ~/.codex token must never be used for a profile.
        getOAuthToken: () => Promise.resolve({ accessToken: "global-codex-jwt" }),
        getSecret: () => Promise.resolve(undefined),
      },
      http: {
        request: (request) => {
          authorization = request.headers?.Authorization;
          return Promise.resolve({
            status: 200,
            headers: {},
            body: JSON.stringify({
              plan_type: "plus",
              rate_limit: {
                primary_window: { used_percent: 33, reset_at: Math.floor(NOW / 1000) + 600 },
                secondary_window: { used_percent: 7, reset_at: Math.floor(NOW / 1000) + 86_400 },
              },
            }),
          });
        },
      },
    };
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host,
      localCollectors: [],
    });

    const result = await service.refreshProviderUsage({ providerIds: ["codex:work"] });

    expect(authorization).toBe("Bearer profile-codex-jwt");
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({ providerId: "codex:work", status: "ok" });
    expect(result.snapshots[0]?.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(33);
  });

  it("reports a Codex profile without auth.json as auth-missing", async () => {
    const homeDir = join(tmpdir(), `poracode-usage-codex-empty-${process.pid}`);
    cachePaths.push(homeDir);
    mkdirSync(homeDir, { recursive: true });
    const settingsPath = tempCachePath();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        agentInstances: {
          fresh: { id: "fresh", driver: "codex", displayName: "Fresh", config: { homeDir } },
        },
      }),
      "utf8",
    );
    let requests = 0;
    const service = new UsageService({
      emit: () => {},
      cachePath: tempCachePath(),
      settingsPath,
      host: {
        now: () => NOW,
        credentials: {
          getOAuthToken: () => Promise.resolve({ accessToken: "global-codex-jwt" }),
          getSecret: () => Promise.resolve(undefined),
        },
        http: {
          request: () => {
            requests += 1;
            return Promise.resolve({ status: 200, headers: {}, body: "{}" });
          },
        },
      },
      localCollectors: [],
    });

    const result = await service.refreshProviderUsage({ providerIds: ["codex:fresh"] });
    expect(requests).toBe(0);
    expect(result.snapshots[0]).toMatchObject({
      providerId: "codex:fresh",
      status: "auth-missing",
    });
  });
});
