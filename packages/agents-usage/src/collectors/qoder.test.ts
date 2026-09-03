import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import type { HostPort } from "../host";
import {
  collectQoder,
  formatQoderPlan,
  isQoderSessionLive,
  parseQoderUsage,
  QODER_PROVIDER_ID,
  QODER_USAGES_ENDPOINT,
  resolveQoderUsagesUrl,
} from "./qoder";

/**
 * Speculative shape assembled from Qoder's big_model_credits fields; the
 * endpoint is private, so the parser falls through several quota-block shapes
 * defensively and the tests pin each branch.
 */
const SAMPLE_PAYLOAD = {
  code: 200,
  data: {
    planQuota: {
      quotaSummary: {
        usedValue: 350,
        limitValue: 1000,
        unit: "credits",
      },
    },
    resourcePackageQuota: {
      quotaSummary: {
        usedValue: 100,
        limitValue: 500,
        unit: "credits",
      },
    },
    totalQuota: {
      quotaSummary: {
        usedValue: 450,
        limitValue: 1500,
        unit: "credits",
      },
    },
    sharedQuota: {
      quotaSummary: {
        usedValue: 0,
        limitValue: 0,
        unit: "credits",
      },
    },
    nextResetAt: "2026-09-01T00:00:00.000Z",
    planName: "Qoder Pro",
    userProfile: {
      email: "developer@qoder.com",
    },
  },
};

/**
 * Real production payload returned by `https://qoder.com/api/v2/me/usages/big_model_credits`.
 * Uses flat snake_case fields and numeric epoch timestamps.
 */
const REAL_PRODUCTION_PAYLOAD = {
  user_id: "019f8334-4bfa-7e9f-b5fa-b18c8612fa46",
  quota_key: "big_model_credits",
  status: "active",
  plan_quota: {
    quota_summary: {
      used_value: 763,
      limit_value: 6000,
      remaining_value: 5237,
      usage_percentage: 13,
      unit: "credits",
    },
    quota_detail: [
      {
        id: "019f8334-4c0a-706c-8058-c496657cc408",
        limit_value: 6000,
        used_value: 763,
        remaining_value: 5237,
        unit: "credits",
        is_active: true,
        usage_percentage: 13,
        expires_at: 0,
        source: "PLAN",
        status: "ACTIVE",
      },
    ],
  },
  resource_package_quota: {
    quota_summary: {
      used_value: 0,
      limit_value: 0,
      remaining_value: 0,
      usage_percentage: 0,
      unit: "credits",
    },
    quota_detail: null,
  },
  dedicated_resource_package_quota: {
    quota_summary: {
      used_value: 0,
      limit_value: 0,
      remaining_value: 0,
      usage_percentage: 0,
      unit: "credits",
    },
    quota_detail: null,
  },
  total_quota: {
    quota_summary: {
      used_value: 763,
      limit_value: 6000,
      remaining_value: 5237,
      usage_percentage: 13,
      unit: "credits",
    },
    quota_detail: [
      {
        id: "019f8334-4c0a-706c-8058-c496657cc408",
        limit_value: 6000,
        used_value: 763,
        remaining_value: 5237,
        unit: "credits",
        is_active: true,
        usage_percentage: 13,
        expires_at: 0,
        source: "PLAN",
        status: "ACTIVE",
      },
    ],
  },
  lastResetAt: 1784612670474,
  nextResetAt: 1790784000000,
};

describe("parseQoderUsage", () => {
  it("parses totalQuota and user profile from a standard response", () => {
    const snap = parseQoderUsage(SAMPLE_PAYLOAD, FAKE_NOW_MS);

    expect(snap.providerId).toBe(QODER_PROVIDER_ID);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Qoder Pro");
    expect(snap.authenticatedAs).toBe("developer@qoder.com");
    expect(snap.fetchedAt).toBe(FAKE_NOW_MS);
    expect(snap.windows).toHaveLength(1);

    const win = snap.windows[0]!;
    expect(win.id).toBe("monthly");
    expect(win.label).toBe("Credits");
    expect(win.unit).toBe("credits");
    expect(win.used).toBe(450);
    expect(win.limit).toBe(1500);
    expect(win.usedPercent).toBe(30);
    expect(win.resetsAt).toBe(Date.parse("2026-09-01T00:00:00.000Z"));
  });

  it("parses real production snake_case big_model_credits payload", () => {
    const snap = parseQoderUsage(REAL_PRODUCTION_PAYLOAD, FAKE_NOW_MS);

    expect(snap.providerId).toBe(QODER_PROVIDER_ID);
    expect(snap.status).toBe("ok");
    expect(snap.authenticatedAs).toBe("019f8334-4bfa-7e9f-b5fa-b18c8612fa46");
    expect(snap.windows).toHaveLength(1);

    const win = snap.windows[0]!;
    expect(win.id).toBe("monthly");
    expect(win.label).toBe("Credits");
    expect(win.unit).toBe("credits");
    expect(win.used).toBe(763);
    expect(win.limit).toBe(6000);
    expect(win.usedPercent).toBe(13);
    expect(win.resetsAt).toBe(1790784000000);
  });

  it("accepts supplementary metadata for plan and user email", () => {
    const snap = parseQoderUsage(REAL_PRODUCTION_PAYLOAD, FAKE_NOW_MS, {
      plan: "Pro+",
      authenticatedAs: "user@example.com",
    });

    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Pro+");
    expect(snap.authenticatedAs).toBe("user@example.com");
  });

  it("parses the new quota-system shape served for migrated accounts", () => {
    // Reconstructed from qodercli 1.1.42 `normalizeQuotaUsage` (the shape the
    // CLI reads from `/api/v2/quota/usage`): the legacy big_model_credits
    // endpoint serves the same blocks for migrated accounts.
    const payload = {
      data: {
        user_id: "019f8334-4bfa-7e9f-b5fa-b18c8612fa46",
        user_type: "personal_professional_plus",
        total_usage_percentage: 22,
        user_quota: {
          total: 6000,
          used: 1200,
          remaining: 4800,
          percentage: 20,
          unit: "credits",
        },
        add_on_quota: {
          total: 500,
          used: 100,
          remaining: 400,
          percentage: 20,
        },
        org_resource_package: {
          cap: 1000,
          used: 100,
          remaining: 900,
          percentage: 10,
        },
        expires_at: 1790784000000,
        is_quota_exceeded: false,
      },
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);

    expect(snap.providerId).toBe(QODER_PROVIDER_ID);
    expect(snap.status).toBe("ok");
    expect(snap.authenticatedAs).toBe("019f8334-4bfa-7e9f-b5fa-b18c8612fa46");
    expect(snap.windows).toHaveLength(1);

    const win = snap.windows[0]!;
    expect(win.id).toBe("monthly");
    expect(win.label).toBe("Credits");
    expect(win.unit).toBe("credits");
    // limit sums user + add-on + org(cap); the server percentage wins for used.
    expect(win.limit).toBe(7500);
    expect(win.used).toBe(1650);
    expect(win.usedPercent).toBe(22);
    expect(win.resetsAt).toBe(1790784000000);
  });

  it("parses the new quota-system shape with camelCase fields at top level", () => {
    const payload = {
      userId: "019f8334-4bfa-7e9f-b5fa-b18c8612fa46",
      userType: "personal_professional_plus",
      totalUsagePercentage: 50,
      userQuota: { total: 2000, used: 800, remaining: 1200 },
      expiresAt: 1790784000000,
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);

    expect(snap.status).toBe("ok");
    expect(snap.windows).toHaveLength(1);
    expect(snap.windows[0]!.limit).toBe(2000);
    expect(snap.windows[0]!.used).toBe(1000);
    expect(snap.windows[0]!.usedPercent).toBe(50);
    expect(snap.windows[0]!.resetsAt).toBe(1790784000000);
  });

  it("derives the new-system total from used + remaining when total is absent", () => {
    const payload = {
      user_quota: { used: 200, remaining: 800 },
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);

    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.limit).toBe(1000);
    expect(snap.windows[0]!.used).toBe(200);
    expect(snap.windows[0]!.usedPercent).toBe(20);
  });

  it("computes the new-system percent from used/limit without a server percentage", () => {
    const payload = {
      user_quota: { total: 1000, used: 250, remaining: 750 },
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);

    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.used).toBe(250);
    expect(snap.windows[0]!.limit).toBe(1000);
    expect(snap.windows[0]!.usedPercent).toBe(25);
  });

  it("calculates merged quota when totalQuota is absent but plan and resourcePackage exist", () => {
    const payload = {
      data: {
        planQuota: {
          quotaSummary: {
            usedValue: 200,
            limitValue: 800,
          },
        },
        resourcePackageQuota: {
          quotaSummary: {
            usedValue: 50,
            limitValue: 200,
          },
        },
      },
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);
    expect(snap.windows[0]!.used).toBe(250);
    expect(snap.windows[0]!.limit).toBe(1000);
    expect(snap.windows[0]!.usedPercent).toBe(25);
  });

  it("handles flat usageLimit object shape", () => {
    const payload = {
      usageLimit: {
        usedValue: 120,
        limitValue: 600,
        resetCycle: "monthly",
      },
      plan: "Team",
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);
    expect(snap.plan).toBe("Team");
    expect(snap.windows[0]!.used).toBe(120);
    expect(snap.windows[0]!.limit).toBe(600);
    expect(snap.windows[0]!.usedPercent).toBe(20);
  });

  it("handles top-level flat numbers", () => {
    const payload = {
      usedValue: 50,
      limitValue: 100,
    };

    const snap = parseQoderUsage(payload, FAKE_NOW_MS);
    expect(snap.windows[0]!.used).toBe(50);
    expect(snap.windows[0]!.limit).toBe(100);
    expect(snap.windows[0]!.usedPercent).toBe(50);
  });

  it("reports missing usage data instead of a healthy 0% ring for quota-less payloads", () => {
    for (const payload of [{}, { data: {} }, { success: false, message: "please login" }]) {
      const snap = parseQoderUsage(payload, FAKE_NOW_MS);
      expect(snap.status).toBe("error");
      expect(snap.error).toBe("missing usage data");
      expect(snap.windows).toHaveLength(0);
    }
  });
});

describe("formatQoderPlan", () => {
  it("formats known Qoder plan tiers", () => {
    expect(formatQoderPlan("PLAN_TIER_PRO_PLUS")).toBe("Pro+");
    expect(formatQoderPlan("PLAN_TIER_PRO")).toBe("Pro");
    expect(formatQoderPlan("PLAN_TIER_FREE")).toBe("Free");
    expect(formatQoderPlan("PLAN_TIER_ENTERPRISE")).toBe("Enterprise");
    expect(formatQoderPlan("PLAN_TIER_TEAM")).toBe("Team");
    expect(formatQoderPlan("Qoder Pro")).toBe("Qoder Pro");
    expect(formatQoderPlan(undefined)).toBeUndefined();
    expect(formatQoderPlan("")).toBeUndefined();
  });
});

describe("resolveQoderUsagesUrl", () => {
  it("defaults to the international usages endpoint", () => {
    expect(resolveQoderUsagesUrl()).toBe(QODER_USAGES_ENDPOINT);
  });

  it("normalizes endpoint and baseUrl overrides", () => {
    expect(
      resolveQoderUsagesUrl({
        accessToken: "pat",
        raw: { endpoint: "https://qoder.com.cn/api/v2/me/usages/big_model_credits" },
      }),
    ).toBe("https://qoder.com.cn/api/v2/me/usages/big_model_credits");

    expect(
      resolveQoderUsagesUrl({ accessToken: "pat", raw: { baseUrl: "https://qoder.com.cn" } }),
    ).toBe("https://qoder.com.cn/api/v2/me/usages/big_model_credits");

    expect(resolveQoderUsagesUrl({ accessToken: "pat", raw: { baseUrl: "qoder.com.cn" } })).toBe(
      "https://qoder.com.cn/api/v2/me/usages/big_model_credits",
    );

    expect(
      resolveQoderUsagesUrl({
        accessToken: "pat",
        raw: { baseUrl: "https://qoder.com.cn/api/v2/me" },
      }),
    ).toBe("https://qoder.com.cn/api/v2/me/usages/big_model_credits");

    expect(
      resolveQoderUsagesUrl({
        accessToken: "pat",
        raw: { baseUrl: "https://qoder.com.cn/api/v2" },
      }),
    ).toBe("https://qoder.com.cn/api/v2/me/usages/big_model_credits");
  });

  it("falls back to the public endpoint when the override does not parse", () => {
    expect(resolveQoderUsagesUrl({ accessToken: "pat", raw: { baseUrl: "::not a url::" } })).toBe(
      QODER_USAGES_ENDPOINT,
    );
  });
});

describe("isQoderSessionLive", () => {
  it("accepts an authenticated probe", async () => {
    const host = createFakeHost({
      routes: { [QODER_USAGES_ENDPOINT]: { status: 200, body: "{}" } },
    });
    expect(await isQoderSessionLive(host.http, "qoder_session=abc")).toBe(true);
  });

  it("rejects a probe answered 401 (non-auth cookies only)", async () => {
    const host = createFakeHost({
      routes: { [QODER_USAGES_ENDPOINT]: { status: 401, body: "{}" } },
    });
    expect(await isQoderSessionLive(host.http, "qoder_locale=en")).toBe(false);
  });

  it("throws on a throttled probe so the capture retry path re-polls", async () => {
    const host = createFakeHost({
      routes: { [QODER_USAGES_ENDPOINT]: { status: 429, body: "{}" } },
    });
    await expect(isQoderSessionLive(host.http, "qoder_session=abc")).rejects.toThrow(
      /indeterminate/,
    );
  });
});

describe("collectQoder", () => {
  it("returns auth-missing when neither cookie nor token is present", async () => {
    const host = createFakeHost();
    const snap = await collectQoder(host);
    expect(snap.status).toBe("auth-missing");
  });

  it("collects successfully with session cookie", async () => {
    let sentHeaders: Record<string, string> | undefined;
    const host = createFakeHost({
      secrets: { [QODER_PROVIDER_ID]: { cookie: "qoder_session=valid_cookie" } },
      onRequest: (req) => {
        sentHeaders = req.headers;
      },
      routes: {
        [QODER_USAGES_ENDPOINT]: {
          body: JSON.stringify(SAMPLE_PAYLOAD),
        },
      },
    });

    const snap = await collectQoder(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(30);
    expect(sentHeaders?.Cookie).toBe("qoder_session=valid_cookie");
    expect(sentHeaders?.Origin).toBe("https://qoder.com");
  });

  it("enriches profile email and plan tier when missing from usages payload", async () => {
    const host = createFakeHost({
      secrets: { [QODER_PROVIDER_ID]: { cookie: "qoder_session=valid_cookie" } },
      routes: {
        [QODER_USAGES_ENDPOINT]: {
          body: JSON.stringify(REAL_PRODUCTION_PAYLOAD),
        },
        "https://qoder.com/api/v1/me": {
          status: 200,
          body: JSON.stringify({ email: "user@example.com", name: "Qoder User" }),
        },
        "https://qoder.com/api/v1/me/userplan": {
          status: 200,
          body: JSON.stringify({ plan_tier: "PLAN_TIER_PRO_PLUS" }),
        },
      },
    });

    const snap = await collectQoder(host);
    expect(snap.status).toBe("ok");
    expect(snap.authenticatedAs).toBe("user@example.com");
    expect(snap.plan).toBe("Pro+");
    expect(snap.windows[0]!.used).toBe(763);
    expect(snap.windows[0]!.limit).toBe(6000);
    expect(snap.windows[0]!.usedPercent).toBe(13);
  });

  it("falls back to the bearer credential when the captured cookie is rejected", async () => {
    const seenHeaders: (Record<string, string> | undefined)[] = [];
    const host: HostPort = {
      now: () => FAKE_NOW_MS,
      credentials: {
        getOAuthToken: () => Promise.resolve({ accessToken: "valid-pat" }),
        getSecret: (_providerId, key) =>
          Promise.resolve(key === "cookie" ? "qoder_session=stale" : undefined),
        setSecret: () => Promise.resolve(),
      },
      http: {
        request: async (req) => {
          seenHeaders.push(req.headers);
          const sent = req.headers ?? {};
          return {
            status: sent.Cookie ? 401 : 200,
            headers: {},
            body: JSON.stringify(SAMPLE_PAYLOAD),
          };
        },
      },
    };

    const snap = await collectQoder(host);
    expect(snap.status).toBe("ok");
    expect(seenHeaders).toHaveLength(2);
    expect(seenHeaders[0]?.Cookie).toBe("qoder_session=stale");
    expect(seenHeaders[1]?.Authorization).toBe("Bearer valid-pat");
  });

  it("collects successfully with OAuth / PAT bearer token", async () => {
    let sentHeaders: Record<string, string> | undefined;
    const host = createFakeHost({
      tokens: { [QODER_PROVIDER_ID]: { accessToken: "qoder-pat-123" } },
      onRequest: (req) => {
        sentHeaders = req.headers;
      },
      routes: {
        [QODER_USAGES_ENDPOINT]: {
          body: JSON.stringify(SAMPLE_PAYLOAD),
        },
      },
    });

    const snap = await collectQoder(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(30);
    expect(sentHeaders?.Authorization).toBe("Bearer qoder-pat-123");
  });

  it("reports auth-missing when a rejected cookie has no bearer to fall back to", async () => {
    const host = createFakeHost({
      secrets: { [QODER_PROVIDER_ID]: { cookie: "qoder_session=stale" } },
      routes: {
        [QODER_USAGES_ENDPOINT]: {
          status: 403,
          body: JSON.stringify({ errorCode: "Unauthorized" }),
        },
      },
    });

    const snap = await collectQoder(host);
    expect(snap.status).toBe("auth-missing");
    expect(snap.error).toContain("403");
  });

  it("handles 401/403 as auth-missing", async () => {
    const host = createFakeHost({
      tokens: { [QODER_PROVIDER_ID]: { accessToken: "expired-token" } },
      routes: {
        [QODER_USAGES_ENDPOINT]: {
          status: 401,
          body: JSON.stringify({ code: 401, msg: "Unauthorized" }),
        },
      },
    });

    const snap = await collectQoder(host);
    expect(snap.status).toBe("auth-missing");
  });

  it("handles 429 rate limit with Retry-After header", async () => {
    const host = createFakeHost({
      tokens: { [QODER_PROVIDER_ID]: { accessToken: "rate-limited-token" } },
      routes: {
        [QODER_USAGES_ENDPOINT]: {
          status: 429,
          headers: { "retry-after": "60" },
          body: "Too Many Requests",
        },
      },
    });

    const snap = await collectQoder(host);
    expect(snap.status).toBe("rate-limited");
    expect(snap.rateLimitedUntil).toBe(FAKE_NOW_MS + 60_000);
  });
});
