import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import { collectMuse, MUSE_KEY_ENDPOINT, parseMuseUsage } from "./muse";

const KEY_BODY = JSON.stringify({
  api_key: "LLM|123|redacted",
  base_url: "https://api.meta.ai/v1",
  has_payment_method: true,
  require_payment: false,
  is_subs_active: true,
  can_subscribe: false,
  show_subs_upsell: true,
  user_full_name: "Ada Lovelace",
  user_email: "ada@example.com",
  payment_method: "Visa-4242",
  action_url: null,
  subs_tier_id: "27681393394859588",
  subs_tier_name: "Muse Code Everyday Usage",
  is_subs_upgrade_available: true,
});

describe("parseMuseUsage", () => {
  it("maps the key response to plan + account with no windows when no meters are exposed", () => {
    const snap = parseMuseUsage(JSON.parse(KEY_BODY), FAKE_NOW_MS);
    expect(snap).toEqual({
      providerId: "muse",
      status: "ok",
      windows: [],
      fetchedAt: FAKE_NOW_MS,
      plan: "Muse Code Everyday Usage",
      authenticatedAs: "ada@example.com",
    });
  });

  it("maps subs_usage into current + weekly percent windows with resets", () => {
    const resetCurrent = FAKE_NOW_MS + 3 * 3_600_000;
    const resetWeekly = FAKE_NOW_MS + 2 * 86_400_000;
    const snap = parseMuseUsage(
      {
        subs_tier_name: "Muse Code Everyday Usage",
        user_email: "ada@example.com",
        subs_usage: {
          window: { used_percent: 12.345, resets_at: resetCurrent, window_duration_mins: 300 },
          weekly: { used_percent: 0, resets_at: resetWeekly },
        },
      },
      FAKE_NOW_MS,
    );
    expect(snap.status).toBe("ok");
    expect(snap.windows).toHaveLength(2);
    expect(snap.windows[0]).toMatchObject({
      id: "session-5h",
      usedPercent: 12.3,
      unit: "percent",
      resetsAt: resetCurrent,
    });
    expect(snap.windows[1]).toMatchObject({
      id: "weekly",
      usedPercent: 0,
      unit: "percent",
      resetsAt: resetWeekly,
    });
  });

  it("skips windows without a usable percent and tolerates a missing subs_usage", () => {
    const snap = parseMuseUsage(
      {
        subs_tier_name: "  ",
        user_full_name: "Ada Lovelace",
        subs_usage: { window: { used_percent: -5 }, weekly: null },
      },
      FAKE_NOW_MS,
    );
    expect(snap.windows).toEqual([]);
    expect(snap.plan).toBeUndefined();
    expect(snap.authenticatedAs).toBe("Ada Lovelace");
  });
});

describe("collectMuse", () => {
  it("returns auth-missing without a stored CLI token", async () => {
    const snap = await collectMuse(createFakeHost());
    expect(snap).toMatchObject({ providerId: "muse", status: "auth-missing", windows: [] });
  });

  it("posts an empty JSON object with the device-code token and parses plan + account", async () => {
    let seenMethod: string | undefined;
    let seenAuth: string | undefined;
    let seenBody: string | undefined;
    const host = createFakeHost({
      tokens: { muse: { accessToken: "dca:probe" } },
      routes: { [MUSE_KEY_ENDPOINT]: { status: 200, body: KEY_BODY } },
      onRequest: (req) => {
        seenMethod = req.method;
        seenAuth = req.headers?.["Authorization"];
        seenBody = req.body;
      },
    });
    const snap = await collectMuse(host);
    expect(seenMethod).toBe("POST");
    expect(seenAuth).toBe("Bearer dca:probe");
    // The endpoint rejects empty posts with 400 — always send `{}`.
    expect(seenBody).toBe("{}");
    expect(snap).toMatchObject({
      providerId: "muse",
      status: "ok",
      plan: "Muse Code Everyday Usage",
      authenticatedAs: "ada@example.com",
    });
  });

  it("maps rejection to auth-missing, throttling to rate-limited, failures to error", async () => {
    const tokens = { muse: { accessToken: "dca:probe" } };
    const rejected = await collectMuse(
      createFakeHost({ tokens, routes: { [MUSE_KEY_ENDPOINT]: { status: 401, body: "{}" } } }),
    );
    expect(rejected.status).toBe("auth-missing");

    const throttled = await collectMuse(
      createFakeHost({
        tokens,
        routes: { [MUSE_KEY_ENDPOINT]: { status: 429, headers: { "retry-after": "120" } } },
      }),
    );
    expect(throttled.status).toBe("rate-limited");
    expect(throttled.rateLimitedUntil).toBe(FAKE_NOW_MS + 120_000);

    const broken = await collectMuse(
      createFakeHost({ tokens, routes: { [MUSE_KEY_ENDPOINT]: { status: 500, body: "oops" } } }),
    );
    expect(broken).toMatchObject({ status: "error", error: "HTTP 500" });

    const garbage = await collectMuse(
      createFakeHost({ tokens, routes: { [MUSE_KEY_ENDPOINT]: { status: 200, body: "nope{" } } }),
    );
    expect(garbage).toMatchObject({ status: "error", error: "invalid JSON response" });
  });
});
