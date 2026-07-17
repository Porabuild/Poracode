import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../host";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import { collectKimi, KIMI_USAGES_ENDPOINT, parseKimiUsage, resolveKimiUsagesUrl } from "./kimi";

const WEEKLY_RESET = "2026-01-09T15:23:13.716839300Z";
const SESSION_RESET = "2026-01-06T13:33:02.717479433Z";

/** Verbatim shape from CodexBar's docs: weekly membership quota + 5h rate limit. */
const USAGES_BODY = JSON.stringify({
  usage: { limit: "2048", used: "214", remaining: "1834", resetTime: WEEKLY_RESET },
  limits: [
    {
      window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
      detail: { limit: "200", used: "139", remaining: "61", resetTime: SESSION_RESET },
    },
  ],
});

describe("parseKimiUsage", () => {
  it("maps the membership quota to weekly and the 300-minute limit to session-5h", () => {
    const snap = parseKimiUsage(JSON.parse(USAGES_BODY), FAKE_NOW_MS);
    expect(snap.providerId).toBe("kimi");
    expect(snap.status).toBe("ok");
    // Fast window leads, matching the Claude/Codex card order.
    expect(snap.windows.map((w) => w.id)).toEqual(["session-5h", "weekly"]);

    const weekly = snap.windows.find((w) => w.id === "weekly")!;
    expect(weekly.usedPercent).toBeCloseTo((214 / 2048) * 100);
    expect(weekly.resetsAt).toBe(Date.parse(WEEKLY_RESET));
    // Percent only — raw request counts would duplicate the percentage on the card.
    expect(weekly.used).toBeUndefined();
    expect(weekly.limit).toBeUndefined();
    expect(weekly.unit).toBeUndefined();

    const session = snap.windows.find((w) => w.id === "session-5h")!;
    expect(session.usedPercent).toBeCloseTo((139 / 200) * 100);
    expect(session.resetsAt).toBe(Date.parse(SESSION_RESET));
  });

  it("derives used from limit-remaining when `used` is absent", () => {
    const snap = parseKimiUsage(
      { usage: { limit: "100", remaining: "25", resetTime: WEEKLY_RESET } },
      FAKE_NOW_MS,
    );
    const weekly = snap.windows.find((w) => w.id === "weekly")!;
    expect(weekly.usedPercent).toBe(75);
  });

  it("tolerates numeric counters and snake_case reset keys", () => {
    const snap = parseKimiUsage(
      { usage: { limit: 2048, used: 512, reset_time: WEEKLY_RESET } },
      FAKE_NOW_MS,
    );
    const weekly = snap.windows.find((w) => w.id === "weekly")!;
    expect(weekly.usedPercent).toBe(25);
    expect(weekly.resetsAt).toBe(Date.parse(WEEKLY_RESET));
  });

  it("picks the shortest rate limit and ignores windows longer than 6 hours", () => {
    const snap = parseKimiUsage(
      {
        limits: [
          {
            window: { duration: 7, timeUnit: "TIME_UNIT_DAY" },
            detail: { limit: "1000", used: "10" },
          },
          {
            window: { duration: 5, timeUnit: "TIME_UNIT_HOUR" },
            detail: { limit: "200", used: "100" },
          },
        ],
      },
      FAKE_NOW_MS,
    );
    expect(snap.windows).toHaveLength(1);
    expect(snap.windows[0]!.id).toBe("session-5h");
    expect(snap.windows[0]!.usedPercent).toBe(50);
  });

  it("clamps overshoot and tolerates an empty body", () => {
    const over = parseKimiUsage({ usage: { limit: "100", used: "150" } }, FAKE_NOW_MS);
    expect(over.windows[0]!.usedPercent).toBe(100);

    const empty = parseKimiUsage(undefined, FAKE_NOW_MS);
    expect(empty.status).toBe("ok");
    expect(empty.windows).toEqual([]);
  });
});

describe("resolveKimiUsagesUrl", () => {
  it("defaults to the public Kimi Code API endpoint", () => {
    expect(resolveKimiUsagesUrl(undefined)).toBe(KIMI_USAGES_ENDPOINT);
    expect(resolveKimiUsagesUrl({ accessToken: "k" })).toBe(KIMI_USAGES_ENDPOINT);
  });

  it("suffixes a bare base URL with /coding/v1/usages", () => {
    expect(resolveKimiUsagesUrl({ accessToken: "k", raw: { baseUrl: "https://proxy.test" } })).toBe(
      "https://proxy.test/coding/v1/usages",
    );
  });

  it("does not double-suffix a base already ending in /coding or /coding/v1", () => {
    expect(
      resolveKimiUsagesUrl({ accessToken: "k", raw: { baseUrl: "https://proxy.test/coding" } }),
    ).toBe("https://proxy.test/coding/v1/usages");
    expect(
      resolveKimiUsagesUrl({ accessToken: "k", raw: { baseUrl: "https://proxy.test/coding/v1/" } }),
    ).toBe("https://proxy.test/coding/v1/usages");
  });
});

describe("collectKimi", () => {
  it("returns auth-missing when neither a pasted key nor a native credential exists", async () => {
    const snap = await collectKimi(createFakeHost());
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });

  it("collects via a pasted API key and sends a Bearer header", async () => {
    let seen: HttpRequest | undefined;
    const host = createFakeHost({
      secrets: { kimi: { apiKey: "kimi-pasted" } },
      routes: { [KIMI_USAGES_ENDPOINT]: { body: USAGES_BODY } },
      onRequest: (req) => {
        seen = req;
      },
    });
    const snap = await collectKimi(host);
    expect(snap.status).toBe("ok");
    expect(snap.windows.map((w) => w.id).sort()).toEqual(["session-5h", "weekly"]);
    expect(seen?.headers?.Authorization).toBe("Bearer kimi-pasted");
  });

  it("collects via the native (CLI/env) token and forwards its identity headers", async () => {
    let seen: HttpRequest | undefined;
    const host = createFakeHost({
      tokens: {
        kimi: {
          accessToken: "cli-token",
          raw: { identityHeaders: { "X-Msh-Platform": "kimi_code_cli", "X-Msh-Device-Id": "d1" } },
        },
      },
      routes: { [KIMI_USAGES_ENDPOINT]: { body: USAGES_BODY } },
      onRequest: (req) => {
        seen = req;
      },
    });
    const snap = await collectKimi(host);
    expect(snap.status).toBe("ok");
    expect(seen?.headers?.Authorization).toBe("Bearer cli-token");
    expect(seen?.headers?.["X-Msh-Platform"]).toBe("kimi_code_cli");
    expect(seen?.headers?.["X-Msh-Device-Id"]).toBe("d1");
  });

  it("prefers the pasted key and drops the CLI identity headers with it", async () => {
    let seen: HttpRequest | undefined;
    const host = createFakeHost({
      secrets: { kimi: { apiKey: "pasted-wins" } },
      tokens: {
        kimi: {
          accessToken: "cli-loses",
          raw: { identityHeaders: { "X-Msh-Device-Id": "d1" } },
        },
      },
      routes: { [KIMI_USAGES_ENDPOINT]: { body: USAGES_BODY } },
      onRequest: (req) => {
        seen = req;
      },
    });
    await collectKimi(host);
    expect(seen?.headers?.Authorization).toBe("Bearer pasted-wins");
    expect(seen?.headers?.["X-Msh-Device-Id"]).toBeUndefined();
  });

  it("maps 401/403 to auth-missing", async () => {
    const host = createFakeHost({
      secrets: { kimi: { apiKey: "bad" } },
      routes: { [KIMI_USAGES_ENDPOINT]: { status: 401, body: "" } },
    });
    expect((await collectKimi(host)).status).toBe("auth-missing");
  });

  it("maps a 429 to rate-limited and honors Retry-After", async () => {
    const host = createFakeHost({
      secrets: { kimi: { apiKey: "k" } },
      routes: {
        [KIMI_USAGES_ENDPOINT]: { status: 429, body: "", headers: { "retry-after": "120" } },
      },
    });
    const snap = await collectKimi(host);
    expect(snap.status).toBe("rate-limited");
    expect(snap.rateLimitedUntil).toBe(FAKE_NOW_MS + 120_000);
  });

  it("maps other failures to error snapshots", async () => {
    const host = createFakeHost({
      secrets: { kimi: { apiKey: "k" } },
      routes: { [KIMI_USAGES_ENDPOINT]: { status: 500, body: "boom" } },
    });
    expect((await collectKimi(host)).status).toBe("error");

    const badJson = createFakeHost({
      secrets: { kimi: { apiKey: "k" } },
      routes: { [KIMI_USAGES_ENDPOINT]: { body: "not json" } },
    });
    expect((await collectKimi(badJson)).status).toBe("error");

    const noUsage = createFakeHost({
      secrets: { kimi: { apiKey: "k" } },
      routes: { [KIMI_USAGES_ENDPOINT]: { body: "{}" } },
    });
    const snap = await collectKimi(noUsage);
    expect(snap.status).toBe("error");
    expect(snap.error).toBe("missing usage data");
  });
});
