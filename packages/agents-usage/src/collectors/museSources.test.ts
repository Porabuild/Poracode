import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS, type FakeHostConfig } from "../testHost";
import { collectMuse, MUSE_KEY_ENDPOINT } from "./muse";
import { museSpendWindow } from "./museDashboard";

const span = museSpendWindow(FAKE_NOW_MS);
const QUOTA = "https://dev.meta.ai/api/portal/teams/team-1/subscription-quota";
const SPEND = `https://dev.meta.ai/api/portal/teams/team-1/usage?metric=USAGE_BILLABLE_COST&start_date=${span.start}&end_date=${span.end}&timezone=UTC`;
const ACCOUNT = "https://dev.meta.ai/api/auth/me";
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
      [ACCOUNT]: json({ email: "ADA@example.com" }),
      ...overrides,
    },
  });
}

describe("Muse source priority", () => {
  it("prefers CLI meters and identity while adding same-account billed spend", async () => {
    const result = await collectMuse(host());
    expect(result.status).toBe("ok");
    expect(result.windows.map((w) => w.usedPercent)).toEqual([20, 30]);
    expect(result.plan).toBe("Everyday");
    expect(result.authenticatedAs).toBe("ada@example.com");
    expect(result.cost?.amount).toBe(1.42);
  });

  it.each([
    json({ email: "other@example.com" }),
    json({}),
    { status: 401 },
    { status: 500 },
    { body: "invalid" },
  ])("does not combine unverified/different browser accounts (%j)", async (account) => {
    const result = await collectMuse(host({ [ACCOUNT]: account }));
    expect(result.windows.map((w) => w.usedPercent)).toEqual([20, 30]);
    expect(result.cost).toBeUndefined();
  });

  it.each([401, 403, 500])(
    "keeps healthy CLI meters when browser session fails with %i",
    async (status) => {
      const result = await collectMuse(host({ [QUOTA]: { status }, [SPEND]: { status } }));
      expect(result.status).toBe("ok");
      expect(result.windows).toHaveLength(2);
      expect(result.cost).toBeUndefined();
    },
  );

  it("falls back to the complete browser snapshot when CLI omits meters", async () => {
    const result = await collectMuse(
      host({
        [MUSE_KEY_ENDPOINT]: json({ subs_tier_name: "Everyday", user_email: "ada@example.com" }),
      }),
    );
    expect(result.status).toBe("ok");
    expect(result.windows.map((w) => w.usedPercent)).toEqual([90]);
    expect(result.plan).toBe("Browser plan");
    expect(result.authenticatedAs).toBeUndefined();
    expect(result.cost?.amount).toBe(1.42);
  });

  it.each([401, 500])("uses browser fallback when CLI fails with %i", async (status) => {
    expect((await collectMuse(host({ [MUSE_KEY_ENDPOINT]: { status } }))).cost?.amount).toBe(1.42);
  });

  it("preserves primary rate limiting and does not request optional sources", async () => {
    const h = host({ [MUSE_KEY_ENDPOINT]: { status: 429, headers: { "retry-after": "3600" } } });
    const request = h.http.request;
    const urls: string[] = [];
    h.http.request = (req) => {
      urls.push(req.url);
      return request(req);
    };
    expect(await collectMuse(h)).toMatchObject({
      status: "rate-limited",
      rateLimitedUntil: FAKE_NOW_MS + 3600000,
    });
    expect(urls).toEqual([MUSE_KEY_ENDPOINT]);
  });

  it("retains optional-source cooldown when CLI returns only account details", async () => {
    const result = await collectMuse(
      host({
        [MUSE_KEY_ENDPOINT]: json({ subs_tier_name: "Everyday", user_email: "ada@example.com" }),
        [QUOTA]: { status: 429, headers: { "retry-after": "3600" } },
        [SPEND]: { status: 429 },
      }),
    );
    expect(result).toMatchObject({
      status: "ok",
      windows: [],
      rateLimitedUntil: FAKE_NOW_MS + 3600000,
    });
  });

  it("honors the longest cooldown across quota, spend and identity endpoints", async () => {
    const result = await collectMuse(
      host({
        [QUOTA]: { status: 429, headers: { "retry-after": "3600" } },
        [ACCOUNT]: { status: 429, headers: { "retry-after": "300" } },
      }),
    );
    expect(result).toMatchObject({
      status: "ok",
      windows: [{ usedPercent: 20 }, { usedPercent: 30 }],
      rateLimitedUntil: FAKE_NOW_MS + 3600000,
    });
    expect(result.cost).toBeUndefined();
  });

  it("works without a browser session or a running CLI", async () => {
    const h = createFakeHost({
      tokens: { muse: { accessToken: "dca:test" } },
      routes: { [MUSE_KEY_ENDPOINT]: json(CLI) },
    });
    expect(await collectMuse(h)).toMatchObject({
      status: "ok",
      windows: [{ usedPercent: 20 }, { usedPercent: 30 }],
    });
  });

  it("rejects malformed success bodies and inference keys", async () => {
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
