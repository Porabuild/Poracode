import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../host";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  collectMuse,
  museJazoest,
  museSpendWindow,
  parseMuseCometTokens,
  parseMuseQuotaWindows,
  parseMuseSpend,
} from "./muse";

const BOOTSTRAP = "https://dev.meta.ai/";
const GRAPHQL = "https://dev.meta.ai/api/graphql/";

/**
 * App-shell HTML in the exact shape Comet serves it: the config blocks live
 * inside JavaScript string literals, so every quote is backslash-escaped
 * (captured from a real `dev.meta.ai` response). This signed-in variant carries
 * populated tokens; values are synthetic but the serialization is not.
 */
const SHELL = [
  '<!DOCTYPE html><html id="facebook"><head><script>',
  '[\\"LSD\\",[],{\\"token\\":\\"lsd-token-1\\"},323],',
  '[\\"DTSGInitialData\\",[],{\\"token\\":\\"dtsg:abc\\"},258],',
  '[\\"CurrentUserInitialData\\",[],{\\"ACCOUNT_ID\\":\\"61550000000001\\",\\"USER_ID\\":\\"0\\"},270],',
  '[\\"RelayAPIConfigDefaults\\",[],{\\"accessToken\\":\\"\\",\\"actorID\\":\\"61550000000001\\"},141],',
  '[\\"SiteData\\",[],{\\"comet_env\\":71,\\"server_revision\\":1046844533,\\"client_revision\\":1046844533,\\"hsi\\":\\"7300000000000000001\\",\\"__spin_r\\":1029384756},317]',
  '</script><a href="/usage/?team_id=778899&project_id=112233">Usage</a></head><body></body></html>',
].join("");

/** The same shell as served to an anonymous visit: LSD exists, DTSG is empty,
 * the actor id is `"0"`. Nothing session-scoped may be invented from it. */
const ANON_SHELL = [
  '<!DOCTYPE html><html id="facebook"><head><script>',
  '[\\"LSD\\",[],{\\"token\\":\\"AdTRSg37QInNd4nSDM7BcdbB6hk\\"},323],',
  '[\\"DTSGInitialData\\",[],{},258],',
  '[\\"CurrentUserInitialData\\",[],{\\"ACCOUNT_ID\\":\\"0\\",\\"USER_ID\\":\\"0\\"},270],',
  '[\\"RelayAPIConfigDefaults\\",[],{\\"accessToken\\":\\"\\",\\"actorID\\":\\"0\\"},141],',
  '[\\"SiteData\\",[],{\\"comet_env\\":71,\\"server_revision\\":1046844533,\\"client_revision\\":1046844533,\\"hsi\\":\\"7681775832330158536\\",\\"__spin_r\\":1046844533},317]',
  "</script></head><body></body></html>",
].join("");

function money(cents: string): { amount_with_offset: string } {
  return { amount_with_offset: cents };
}

/** Response in the observed `data.team.spend_cost_metrics` shape. */
function usageResponse(extra: Record<string, unknown> = {}): string {
  return `for (;;);${JSON.stringify({
    data: {
      team: {
        spend_cost_metrics: [
          {
            identifier: "usage_billable_cost",
            categorical_data: [
              { key: "2026-09-03", value: money("101") },
              { key: "2026-09-04", value: money("40") },
            ],
          },
        ],
        ...extra,
      },
    },
  })}`;
}

describe("parseMuseCometTokens", () => {
  it("scrapes the request-scoped tokens out of a signed-in app shell", () => {
    expect(parseMuseCometTokens(SHELL)).toEqual({
      teamId: "778899",
      lsd: "lsd-token-1",
      fbDtsg: "dtsg:abc",
      actorId: "61550000000001",
      userId: "0",
      cometReq: "71",
      rev: "1029384756",
      hsi: "7300000000000000001",
    });
  });

  it("reads the logged-out shell without inventing session state", () => {
    expect(parseMuseCometTokens(ANON_SHELL)).toEqual({
      lsd: "AdTRSg37QInNd4nSDM7BcdbB6hk",
      userId: "0",
      cometReq: "71",
      rev: "1046844533",
      hsi: "7681775832330158536",
    });
  });

  it("omits tokens the page does not carry rather than inventing them", () => {
    expect(parseMuseCometTokens("<html></html>")).toEqual({});
  });
});

describe("museJazoest", () => {
  it("sums the fb_dtsg char codes behind a 2 prefix", () => {
    // "ab" → 97 + 98 = 195
    expect(museJazoest("ab")).toBe("2195");
  });
});

describe("museSpendWindow", () => {
  it("covers a trailing 30 days inclusive", () => {
    const span = museSpendWindow(Date.UTC(2026, 8, 4));
    expect(span.end).toBe("2026-09-04");
    expect(span.start).toBe("2026-08-06");
  });
});

describe("parseMuseSpend", () => {
  it("sums the billable-cost series from minor units", () => {
    expect(parseMuseSpend(JSON.parse(usageResponse().slice("for (;;);".length)))).toBe(1.41);
  });

  it("honours an explicit currency offset", () => {
    const payload = {
      data: {
        team: {
          spend_cost_metrics: [
            {
              identifier: "usage_billable_cost",
              categorical_data: [{ value: { amount_with_offset: "1410", offset: 3 } }],
            },
          ],
        },
      },
    };
    expect(parseMuseSpend(payload)).toBe(1.41);
  });

  it("ignores series for other identifiers", () => {
    const payload = {
      data: {
        team: {
          spend_cost_metrics: [
            { identifier: "something_else", categorical_data: [{ value: money("999") }] },
          ],
        },
      },
    };
    expect(parseMuseSpend(payload)).toBeUndefined();
  });

  it("returns undefined when no spend series is present", () => {
    expect(parseMuseSpend({ data: { team: {} } })).toBeUndefined();
  });
});

// Sanitized real response: weighted quota values are decimal strings, resets are seconds.
const QUOTA = {
  tier: "Muse Code Everyday Usage",
  as_of: 1788555625,
  window_weighted_used: "2627853460",
  window_weighted_limit: "6000000000",
  window_resets_at: 1788558965,
  weekly_weighted_used: "2627853460",
  weekly_weighted_limit: "17000000000",
  weekly_resets_at: 1788739200,
};

describe("parseMuseQuotaWindows", () => {
  it("maps the observed weighted subscription quota and reset timestamps", () => {
    const windows = parseMuseQuotaWindows({ data: { team: { subscription_quota_usage: QUOTA } } });
    expect(windows).toEqual([
      {
        id: "session-5h",
        label: "Current usage",
        usedPercent: (2627853460 / 6000000000) * 100,
        unit: "percent",
        resetsAt: 1788558965000,
      },
      {
        id: "weekly",
        label: "Weekly limit",
        usedPercent: (2627853460 / 17000000000) * 100,
        unit: "percent",
        resetsAt: 1788739200000,
      },
    ]);
  });

  it("preserves zero usage and skips unavailable limits", () => {
    expect(
      parseMuseQuotaWindows({
        subscription_quota_usage: {
          ...QUOTA,
          window_weighted_used: "0",
          weekly_weighted_limit: "0",
        },
      }),
    ).toMatchObject([{ id: "session-5h", usedPercent: 0 }]);
  });

  it("does not infer quota from unrelated usage-shaped objects", () => {
    expect(parseMuseQuotaWindows({ weekly: { percent: 15 } })).toEqual([]);
    expect(parseMuseQuotaWindows({ data: { team: { subscription_quota_usage: null } } })).toEqual(
      [],
    );
  });
});

describe("collectMuse", () => {
  it("reports auth-missing without a captured cookie", async () => {
    const host = createFakeHost();
    await expect(collectMuse(host)).resolves.toEqual({
      providerId: "muse",
      status: "auth-missing",
      windows: [],
      fetchedAt: FAKE_NOW_MS,
    });
  });

  it("returns the 5h + weekly windows and billed spend", async () => {
    const requests: HttpRequest[] = [];
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1; xs=2", teamId: "1387096610018240" } },
      onRequest: (req) => requests.push(req),
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: {
          status: 200,
          body: usageResponse({
            subscription_quota_usage: QUOTA,
          }),
        },
      },
    });

    const snapshot = await collectMuse(host);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.windows.map((w) => [w.id, w.usedPercent])).toEqual([
      ["session-5h", (2627853460 / 6000000000) * 100],
      ["weekly", (2627853460 / 17000000000) * 100],
    ]);
    // Billed by Meta, so never flagged as an estimate.
    expect(snapshot.cost).toEqual({
      currency: "USD",
      amount: 1.41,
      period: "30d",
      estimated: false,
    });

    const query = requests.find((req) => req.url === GRAPHQL);
    expect(query?.method).toBe("POST");
    expect(query?.headers?.["X-FB-LSD"]).toBe("lsd-token-1");
    expect(query?.headers?.Referer).toBe("https://dev.meta.ai/usage");
    const body = new URLSearchParams(query?.body ?? "");
    expect(body.get("doc_id")).toBe("28117303444603430");
    expect(body.get("fb_api_req_friendly_name")).toBe("LLMDCUsageQuery");
    expect(body.get("fb_dtsg")).toBe("dtsg:abc");
    expect(body.get("jazoest")).toBe(museJazoest("dtsg:abc"));
    expect(body.get("av")).toBe("61550000000001");
    expect(body.get("__user")).toBe("0");
    expect(body.get("__comet_req")).toBe("71");
    const variables = JSON.parse(body.get("variables") ?? "{}");
    expect(variables.team_id).toBe("1387096610018240");
    expect(variables.__relay_internal__pv__Usage_ShouldIncludeSubscriptionQuotarelayprovider).toBe(
      true,
    );
    expect(variables.__relay_internal__pv__Usage_ShouldIncludeCostMetricsrelayprovider).toBe(true);
  });

  it("falls back to the shell team_id for a session captured before it was sealed", async () => {
    const requests: HttpRequest[] = [];
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1" } },
      onRequest: (req) => requests.push(req),
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: { status: 200, body: usageResponse() },
      },
    });
    await collectMuse(host);
    const body = new URLSearchParams(requests.find((r) => r.url === GRAPHQL)?.body ?? "");
    expect(JSON.parse(body.get("variables") ?? "{}").team_id).toBe("778899");
  });

  it("reports auth-missing when neither a sealed nor a scraped team id exists", async () => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1" } },
      routes: { [BOOTSTRAP]: { status: 200, body: "<html></html>" } },
    });
    const snapshot = await collectMuse(host);
    expect(snapshot.status).toBe("auth-missing");
    expect(snapshot.windows).toEqual([]);
  });

  it("treats a rejected session as auth-missing so the card offers re-login", async () => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1" } },
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: { status: 401, body: "" },
      },
    });
    await expect(collectMuse(host)).resolves.toMatchObject({ status: "auth-missing" });
  });

  it("surfaces rate limiting distinctly", async () => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1" } },
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: { status: 429, body: "" },
      },
    });
    await expect(collectMuse(host)).resolves.toMatchObject({ status: "rate-limited" });
  });

  it("errors on a GraphQL-level rejection rather than reporting empty usage", async () => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1" } },
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: {
          status: 200,
          body: JSON.stringify({ errors: [{ message: "Invalid doc_id" }] }),
        },
      },
    });
    await expect(collectMuse(host)).resolves.toMatchObject({ status: "error" });
  });

  it.each([
    [{ __ar: 1, error: 1357001, errorSummary: "Log in to continue" }, "auth-missing"],
    [{ __ar: 1, error: 12345 }, "error"],
    [{ data: { team: {} } }, "error"],
  ])("does not report successful empty usage for %j", async (payload, status) => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "llm_sess=test" } },
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: { status: 200, body: `for (;;);${JSON.stringify(payload)}` },
      },
    });
    await expect(collectMuse(host)).resolves.toMatchObject({ status, windows: [] });
  });

  it("still reports ok with spend when the quota block is absent", async () => {
    const host = createFakeHost({
      secrets: { muse: { cookie: "c_user=1" } },
      routes: {
        [BOOTSTRAP]: { status: 200, body: SHELL },
        [GRAPHQL]: { status: 200, body: usageResponse() },
      },
    });
    const snapshot = await collectMuse(host);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.windows).toEqual([]);
    expect(snapshot.cost?.amount).toBe(1.41);
  });
});
