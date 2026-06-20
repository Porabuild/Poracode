import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../host";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  collectZai,
  parseZaiUsage,
  resolveZaiQuotaUrl,
  ZAI_BIGMODEL_QUOTA_ENDPOINT,
  ZAI_GLOBAL_QUOTA_ENDPOINT,
} from "./zai";

const SESSION_RESET = FAKE_NOW_MS + 60 * 60 * 1000;
const WEEKLY_RESET = FAKE_NOW_MS + 3 * 24 * 60 * 60 * 1000;

/** A two-window GLM Coding Plan quota body: 5-hour + weekly token limits. */
const QUOTA_BODY = JSON.stringify({
  code: 200,
  msg: "success",
  success: true,
  data: {
    planName: "GLM Coding Max",
    limits: [
      {
        type: "TOKENS_LIMIT",
        unit: 3, // hours
        number: 5,
        usage: 1_000_000, // total cap
        currentValue: 250_000,
        remaining: 750_000,
        percentage: 99, // deliberately wrong — computed value must win
        nextResetTime: SESSION_RESET,
      },
      {
        type: "TOKENS_LIMIT",
        unit: 6, // weeks
        number: 1,
        usage: 20_000_000,
        currentValue: 4_000_000,
        remaining: 16_000_000,
        percentage: 0,
        nextResetTime: WEEKLY_RESET,
      },
    ],
  },
});

describe("parseZaiUsage", () => {
  it("maps two token limits onto session-5h (shortest) and weekly (longest)", () => {
    const snap = parseZaiUsage(JSON.parse(QUOTA_BODY).data, FAKE_NOW_MS);
    expect(snap.providerId).toBe("zai");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("GLM Coding Max");

    const session = snap.windows.find((w) => w.id === "session-5h")!;
    const weekly = snap.windows.find((w) => w.id === "weekly")!;
    // 250k of 1M used → 25% (computed beats the bogus `percentage: 99`).
    expect(session.usedPercent).toBeCloseTo(25);
    expect(session.resetsAt).toBe(SESSION_RESET);
    // 4M of 20M used → 20%.
    expect(weekly.usedPercent).toBeCloseTo(20);
    expect(weekly.resetsAt).toBe(WEEKLY_RESET);
  });

  it("falls back to the API percentage when the cap is absent", () => {
    const snap = parseZaiUsage(
      { limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 42 }] },
      FAKE_NOW_MS,
    );
    expect(snap.windows[0]!.usedPercent).toBe(42);
  });

  it("places a lone token limit by its own duration and folds TIME_LIMIT into monthly", () => {
    const snap = parseZaiUsage(
      {
        limits: [
          { type: "TOKENS_LIMIT", unit: 6, number: 1, usage: 100, currentValue: 30 },
          { type: "TIME_LIMIT", unit: 5, number: 1, usage: 10, currentValue: 1 },
        ],
      },
      FAKE_NOW_MS,
    );
    expect(snap.windows.find((w) => w.id === "weekly")?.usedPercent).toBeCloseTo(30);
    expect(snap.windows.find((w) => w.id === "monthly")?.usedPercent).toBeCloseTo(10);
  });

  it("surfaces the TIME_LIMIT as the monthly MCP quota (5h tokens + MCP, like the dashboard)", () => {
    // Mirrors a real coding-plan response: a 5-hour TOKENS_LIMIT plus the monthly
    // MCP TIME_LIMIT whose currentValue (102) overshoots the cap (100) -> clamp 100%.
    const snap = parseZaiUsage(
      {
        planName: "Pro",
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            usage: 40_000_000,
            currentValue: 0,
            remaining: 40_000_000,
            percentage: 0,
            nextResetTime: SESSION_RESET,
          },
          {
            type: "TIME_LIMIT",
            unit: 5,
            number: 1,
            usage: 100,
            currentValue: 102,
            remaining: 0,
            percentage: 100,
            nextResetTime: WEEKLY_RESET,
            usageDetails: [
              { modelCode: "search-prime", usage: 95 },
              { modelCode: "web-reader", usage: 1 },
              { modelCode: "zread", usage: 0 },
            ],
          },
        ],
      },
      FAKE_NOW_MS,
    );
    const session = snap.windows.find((w) => w.id === "session-5h")!;
    expect(session.usedPercent).toBe(0);
    const mcp = snap.windows.find((w) => w.id === "monthly")!;
    expect(mcp.label).toBe("MCP");
    expect(mcp.usedPercent).toBe(100); // 102/100 clamped
    expect(mcp.resetsAt).toBe(WEEKLY_RESET);
  });

  it("reads the plan tier from `level` (real Pro response) and title-cases it", () => {
    expect(parseZaiUsage({ level: "pro", limits: [] }, FAKE_NOW_MS).plan).toBe("Pro");
    expect(parseZaiUsage({ level: "max", limits: [] }, FAKE_NOW_MS).plan).toBe("Max");
    // A name key still wins over `level` when both are present.
    expect(parseZaiUsage({ planName: "Team", level: "pro", limits: [] }, FAKE_NOW_MS).plan).toBe(
      "Team",
    );
  });

  it("parses the verbatim Pro coding-plan response (5h tokens + monthly MCP)", () => {
    // Exact shape returned by api.z.ai for a Pro plan: the 5h token limit carries
    // only `percentage`, and the plan tier is in `level` (not planName).
    const snap = parseZaiUsage(
      {
        limits: [
          {
            type: "TIME_LIMIT",
            unit: 5,
            number: 1,
            usage: 1000,
            currentValue: 16,
            remaining: 984,
            percentage: 1,
            nextResetTime: 1782722490998,
            usageDetails: [
              { modelCode: "search-prime", usage: 15 },
              { modelCode: "web-reader", usage: 1 },
              { modelCode: "zread", usage: 0 },
            ],
          },
          { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 0 },
        ],
        level: "pro",
      },
      FAKE_NOW_MS,
    );
    expect(snap.plan).toBe("Pro");
    expect(snap.windows.map((w) => w.id).sort()).toEqual(["monthly", "session-5h"]);
    const session = snap.windows.find((w) => w.id === "session-5h")!;
    expect(session.usedPercent).toBe(0);
    expect(session.resetsAt).toBeUndefined();
    const mcp = snap.windows.find((w) => w.id === "monthly")!;
    expect(mcp.label).toBe("MCP");
    expect(mcp.usedPercent).toBeCloseTo(1.6); // 16 / 1000 (computed beats the floored `percentage: 1`)
    expect(mcp.resetsAt).toBe(1782722490998);
  });

  it("maps a three-limit plan (5h + weekly tokens + MCP) to all three windows", () => {
    // Verbatim from CodexBar's three-limit fixture: higher/other plans return a
    // weekly TOKENS_LIMIT (unit:6=weeks) in addition to the 5h token + MCP time limit.
    const snap = parseZaiUsage(
      {
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            percentage: 25,
            nextResetTime: 1775020168897,
          },
          { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 9, nextResetTime: 1775588029998 },
          {
            type: "TIME_LIMIT",
            unit: 5,
            number: 1,
            usage: 1000,
            currentValue: 224,
            remaining: 776,
            percentage: 22,
            nextResetTime: 1777575229998,
            usageDetails: [
              { modelCode: "search-prime", usage: 210 },
              { modelCode: "web-reader", usage: 14 },
            ],
          },
        ],
        level: "max",
      },
      FAKE_NOW_MS,
    );
    expect(snap.plan).toBe("Max");
    expect(snap.windows.map((w) => w.id).sort()).toEqual(["monthly", "session-5h", "weekly"]);
    expect(snap.windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(25);
    expect(snap.windows.find((w) => w.id === "weekly")?.usedPercent).toBe(9);
    const mcp = snap.windows.find((w) => w.id === "monthly")!;
    expect(mcp.label).toBe("MCP");
    expect(mcp.usedPercent).toBeCloseTo(22.4); // 224 / 1000 (computed)
    expect(mcp.resetsAt).toBe(1777575229998);
  });

  it("tolerates an empty body", () => {
    const empty = parseZaiUsage(undefined, FAKE_NOW_MS);
    expect(empty.status).toBe("ok");
    expect(empty.windows).toEqual([]);
    expect(empty.plan).toBeUndefined();
  });
});

describe("resolveZaiQuotaUrl", () => {
  it("defaults to the global endpoint", () => {
    expect(resolveZaiQuotaUrl(undefined)).toBe(ZAI_GLOBAL_QUOTA_ENDPOINT);
  });

  it("derives the quota path from an apiHost override", () => {
    expect(resolveZaiQuotaUrl({ accessToken: "k", raw: { apiHost: "open.bigmodel.cn" } })).toBe(
      ZAI_BIGMODEL_QUOTA_ENDPOINT,
    );
  });

  it("uses a full quotaUrl override verbatim", () => {
    const override = "https://open.bigmodel.cn/api/coding/paas/v4";
    expect(resolveZaiQuotaUrl({ accessToken: "k", raw: { quotaUrl: override } })).toBe(override);
  });
});

describe("collectZai", () => {
  it("returns auth-missing when neither a pasted key nor a native token exists", async () => {
    const snap = await collectZai(createFakeHost());
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });

  it("collects via a pasted API key and sends a Bearer header", async () => {
    let seen: HttpRequest | undefined;
    const host = createFakeHost({
      secrets: { zai: { apiKey: "zai-pasted" } },
      routes: { [ZAI_GLOBAL_QUOTA_ENDPOINT]: { body: QUOTA_BODY } },
      onRequest: (req) => {
        seen = req;
      },
    });
    const snap = await collectZai(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("GLM Coding Max");
    expect(snap.windows.map((w) => w.id).sort()).toEqual(["session-5h", "weekly"]);
    expect(seen?.headers?.Authorization).toBe("Bearer zai-pasted");
  });

  it("collects via the native (env/config) token when no key is pasted", async () => {
    const host = createFakeHost({
      tokens: { zai: { accessToken: "zai-env" } },
      routes: { [ZAI_GLOBAL_QUOTA_ENDPOINT]: { body: QUOTA_BODY } },
    });
    const snap = await collectZai(host);
    expect(snap.status).toBe("ok");
  });

  it("prefers the pasted key over the native token", async () => {
    let seen: HttpRequest | undefined;
    const host = createFakeHost({
      secrets: { zai: { apiKey: "pasted-wins" } },
      tokens: { zai: { accessToken: "env-loses" } },
      routes: { [ZAI_GLOBAL_QUOTA_ENDPOINT]: { body: QUOTA_BODY } },
      onRequest: (req) => {
        seen = req;
      },
    });
    await collectZai(host);
    expect(seen?.headers?.Authorization).toBe("Bearer pasted-wins");
  });

  it("maps a 401 to auth-missing", async () => {
    const host = createFakeHost({
      secrets: { zai: { apiKey: "bad" } },
      routes: { [ZAI_GLOBAL_QUOTA_ENDPOINT]: { status: 401, body: "" } },
    });
    expect((await collectZai(host)).status).toBe("auth-missing");
  });

  it("treats a 200 success:false auth message as auth-missing", async () => {
    const host = createFakeHost({
      secrets: { zai: { apiKey: "bad" } },
      routes: {
        [ZAI_GLOBAL_QUOTA_ENDPOINT]: {
          body: JSON.stringify({ code: 401, success: false, msg: "Unauthorized token" }),
        },
      },
    });
    expect((await collectZai(host)).status).toBe("auth-missing");
  });

  it("treats a non-auth success:false as an error", async () => {
    const host = createFakeHost({
      secrets: { zai: { apiKey: "k" } },
      routes: {
        [ZAI_GLOBAL_QUOTA_ENDPOINT]: {
          body: JSON.stringify({ code: 500, success: false, msg: "internal error" }),
        },
      },
    });
    const snap = await collectZai(host);
    expect(snap.status).toBe("error");
    expect(snap.error).toBe("internal error");
  });
});
