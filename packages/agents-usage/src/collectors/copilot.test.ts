import { describe, expect, it } from "vitest";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import { collectCopilot, COPILOT_USER_ENDPOINT, parseCopilotUsage } from "./copilot";

describe("parseCopilotUsage", () => {
  it("maps premium_interactions percent_remaining to usedPercent", () => {
    const body = {
      copilot_plan: "copilot_pro",
      login: "octo-dev",
      quota_reset_date: "2026-06-01",
      quota_snapshots: {
        premium_interactions: { entitlement: 300, remaining: 90, percent_remaining: 30 },
      },
    };
    const snap = parseCopilotUsage(body, FAKE_NOW_MS);
    const w = snap.windows.find((x) => x.id === "monthly");
    expect(w?.usedPercent).toBe(70);
    expect(w?.label).toBe("Premium requests");
    expect(w?.limit).toBe(300);
    expect(w?.used).toBe(210);
    expect(snap.plan).toBe("Copilot Pro");
    expect(snap.authenticatedAs).toBe("octo-dev");
  });

  it("does not surface chat quota as premium usage for paid plans", () => {
    const body = {
      copilot_plan: "business",
      limited_user_quotas: { chat: 460 },
      monthly_quotas: { chat: 500 },
    };
    const snap = parseCopilotUsage(body, FAKE_NOW_MS);
    expect(snap.windows).toEqual([]);
  });

  it("handles free limited quotas reported with an individual plan", () => {
    const body = {
      copilot_plan: "individual",
      access_type_sku: "free_limited_copilot",
      limited_user_quotas: { chat: 10 },
      monthly_quotas: { chat: 50 },
      limited_user_reset_date: "2026-06-01",
    };
    const snap = parseCopilotUsage(body, FAKE_NOW_MS);
    expect(snap.windows.find((x) => x.id === "monthly")?.usedPercent).toBe(80);
  });

  it("handles free tier limited quotas", () => {
    const body = {
      copilot_plan: "free",
      limited_user_quotas: { chat: 10 },
      monthly_quotas: { chat: 50 },
      limited_user_reset_date: "2026-06-01",
    };
    const snap = parseCopilotUsage(body, FAKE_NOW_MS);
    expect(snap.windows.find((x) => x.id === "monthly")?.usedPercent).toBe(80);
    expect(snap.plan).toBe("Copilot Free");
  });
});

describe("collectCopilot", () => {
  it("returns auth-missing without a token", async () => {
    expect((await collectCopilot(createFakeHost())).status).toBe("auth-missing");
  });

  it("uses the GitHub `token` auth scheme and version headers", async () => {
    let captured: Record<string, string> | undefined;
    const host = createFakeHost({
      tokens: { copilot: { accessToken: "ghtok" } },
      routes: {
        [COPILOT_USER_ENDPOINT]: {
          body: JSON.stringify({
            copilot_plan: "business",
            quota_snapshots: { premium_interactions: { percent_remaining: 100 } },
          }),
        },
      },
      onRequest: (req) => {
        captured = req.headers;
      },
    });
    const snap = await collectCopilot(host);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Copilot Business");
    expect(captured?.Authorization).toBe("token ghtok");
    expect(captured?.["X-GitHub-Api-Version"]).toBe("2025-04-01");
  });

  it("uses the stored Copilot login token before native fallbacks", async () => {
    let captured: Record<string, string> | undefined;
    const host = createFakeHost({
      secrets: { copilot: { token: "stored" } },
      tokens: { copilot: { accessToken: "native" } },
      routes: {
        [COPILOT_USER_ENDPOINT]: {
          body: JSON.stringify({
            copilot_plan: "business",
            quota_snapshots: { premium_interactions: { percent_remaining: 100 } },
          }),
        },
      },
      onRequest: (req) => {
        captured = req.headers;
      },
    });
    const snap = await collectCopilot(host);
    expect(snap.status).toBe("ok");
    expect(captured?.Authorization).toBe("token stored");
  });

  it("treats a paid response without quota snapshots as needing Copilot login", async () => {
    const host = createFakeHost({
      tokens: { copilot: { accessToken: "ghtok" } },
      routes: {
        [COPILOT_USER_ENDPOINT]: {
          body: JSON.stringify({
            copilot_plan: "individual",
            limited_user_quotas: { chat: 460 },
            monthly_quotas: { chat: 500 },
          }),
        },
      },
    });
    const snap = await collectCopilot(host);
    expect(snap.status).toBe("auth-missing");
    expect(snap.windows).toEqual([]);
  });
});
