import { describe, expect, it, vi } from "vitest";
import { createFakeHost, FAKE_NOW_MS, type FakeHostConfig } from "../testHost";
import { collectMuse, MUSE_KEY_ENDPOINT } from "./muse";
import { museSpendWindow } from "./museDashboard";

const span = museSpendWindow(FAKE_NOW_MS);
const QUOTA = "https://dev.meta.ai/api/portal/teams/team-1/subscription-quota";
const SPEND = `https://dev.meta.ai/api/portal/teams/team-1/usage?metric=USAGE_BILLABLE_COST&start_date=${span.start}&end_date=${span.end}&timezone=UTC`;
const CLI = {
  subs_tier_name: "Everyday",
  user_email: "ada@example.com",
  subs_usage: { window: { used_percent: 20 }, weekly: { used_percent: 30 } },
};
const json = (value: unknown) => ({ status: 200, body: JSON.stringify(value) });
function host(overrides: FakeHostConfig["routes"] = {}) {
  return createFakeHost({
    tokens: { muse: { accessToken: "dca:test" } },
    secrets: { muse: { cookie: "llm_sess=test", teamId: "team-1" } },
    routes: {
      [MUSE_KEY_ENDPOINT]: json(CLI),
      [QUOTA]: json({
        subscription_quota: {
          window_weighted_used: "90",
          window_weighted_limit: "100",
          tier: "Browser plan",
        },
      }),
      [SPEND]: json({
        metric: "usage_billable_cost",
        series: [{ type: "TOTAL", data_points: [{ value: 142000000 }] }],
      }),
      ...overrides,
    },
  });
}

describe("Muse source priority", () => {
  it("uses browser quota and billing without reading CLI credentials or mixing accounts", async () => {
    const h = host();
    const getOAuthToken = vi.spyOn(h.credentials, "getOAuthToken");
    const request = vi.spyOn(h.http, "request");
    const result = await collectMuse(h);
    expect(result.status).toBe("ok");
    expect(result.windows.map((w) => w.usedPercent)).toEqual([90]);
    expect(result.plan).toBe("Browser plan");
    expect(result.authenticatedAs).toBeUndefined();
    expect(result.cost?.amount).toBe(1.42);
    expect(getOAuthToken).not.toHaveBeenCalled();
    expect(request.mock.calls.map(([req]) => req.url)).toEqual([QUOTA, SPEND]);
  });

  it.each([401, 403, 500])(
    "does not fall back to CLI credentials when the browser session fails with %i",
    async (status) => {
      const h = host({ [QUOTA]: { status }, [SPEND]: { status } });
      const getOAuthToken = vi.spyOn(h.credentials, "getOAuthToken");
      expect(await collectMuse(h)).toMatchObject({
        status: status === 500 ? "error" : "auth-missing",
        windows: [],
      });
      expect(getOAuthToken).not.toHaveBeenCalled();
    },
  );

  it("does not read CLI credentials when a saved session requires team selection", async () => {
    const h = createFakeHost({
      tokens: { muse: { accessToken: "dca:test" } },
      secrets: { muse: { cookie: "llm_sess=test" } },
      routes: {
        "https://dev.meta.ai/api/portal/teams": json({ teams: [] }),
        [MUSE_KEY_ENDPOINT]: json(CLI),
      },
    });
    const getOAuthToken = vi.spyOn(h.credentials, "getOAuthToken");
    expect((await collectMuse(h)).status).toBe("auth-missing");
    expect(getOAuthToken).not.toHaveBeenCalled();
  });

  it("keeps browser cooldowns without requesting CLI credentials", async () => {
    const h = host({
      [QUOTA]: { status: 429, headers: { "retry-after": "3600" } },
      [SPEND]: { status: 429, headers: { "retry-after": "300" } },
    });
    const getOAuthToken = vi.spyOn(h.credentials, "getOAuthToken");
    expect(await collectMuse(h)).toMatchObject({
      status: "rate-limited",
      rateLimitedUntil: FAKE_NOW_MS + 3600000,
    });
    expect(getOAuthToken).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])(
    "uses CLI quota and identity only when the browser cookie is absent or blank: %j",
    async (cookie) => {
      const h = createFakeHost({
        tokens: { muse: { accessToken: "dca:test" } },
        secrets: { muse: cookie === undefined ? {} : { cookie } },
        routes: { [MUSE_KEY_ENDPOINT]: json(CLI) },
      });
      const getOAuthToken = vi.spyOn(h.credentials, "getOAuthToken");
      const request = vi.spyOn(h.http, "request");
      expect(await collectMuse(h)).toMatchObject({
        status: "ok",
        windows: [{ usedPercent: 20 }, { usedPercent: 30 }],
        authenticatedAs: "ada@example.com",
        plan: "Everyday",
      });
      expect(getOAuthToken).toHaveBeenCalledWith("muse");
      expect(request.mock.calls.map(([req]) => req.url)).toEqual([MUSE_KEY_ENDPOINT]);
    },
  );

  it("preserves CLI rate limiting when there is no browser session", async () => {
    const h = createFakeHost({
      tokens: { muse: { accessToken: "dca:test" } },
      routes: { [MUSE_KEY_ENDPOINT]: { status: 429, headers: { "retry-after": "3600" } } },
    });
    expect(await collectMuse(h)).toMatchObject({
      status: "rate-limited",
      rateLimitedUntil: FAKE_NOW_MS + 3600000,
    });
  });

  it("rejects malformed success bodies and inference keys without a browser session", async () => {
    for (const body of [null, [], {}, "account"]) {
      expect(
        (
          await collectMuse(
            createFakeHost({
              tokens: { muse: { accessToken: "dca:test" } },
              routes: { [MUSE_KEY_ENDPOINT]: json(body) },
            }),
          )
        ).status,
      ).toBe("error");
    }
    expect(
      (await collectMuse(createFakeHost({ tokens: { muse: { accessToken: "LLM|inference" } } })))
        .status,
    ).toBe("auth-missing");
  });
});
