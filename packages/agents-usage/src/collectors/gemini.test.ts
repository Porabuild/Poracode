import { describe, expect, it, vi } from "vitest";
import type { HostPort } from "../host";
import {
  GEMINI_LOAD_ENDPOINT,
  GEMINI_QUOTA_ENDPOINT,
  collectGemini,
  geminiQuotaGroup,
  parseGeminiUsage,
} from "./gemini";

const NOW = 1_717_000_000_000;

describe("parseGeminiUsage", () => {
  it("collapses every model version (incl. preview) into 3 broad family tiers", () => {
    const load = { currentTier: { id: "free-tier" }, cloudaicompanionProject: "proj-1" };
    // Real wire shape: { buckets: [{ modelId, tokenType, remainingFraction, resetTime }] }.
    const quota = {
      buckets: [
        {
          modelId: "gemini-2.5-flash",
          tokenType: "REQUESTS",
          remainingFraction: 1,
          resetTime: "2026-05-30T00:00:00Z",
        },
        // Newer flash version folds into the same Flash tier.
        { modelId: "gemini-3-flash", tokenType: "REQUESTS", remainingFraction: 0.6 },
        {
          modelId: "gemini-2.5-flash-lite",
          tokenType: "REQUESTS",
          remainingFraction: 1,
          resetTime: "2026-05-30T00:00:00Z",
        },
        // Multiple Pro versions + a preview all share the Pro tier; lowest wins.
        {
          modelId: "gemini-2.5-pro",
          tokenType: "REQUESTS",
          remainingFraction: 0.5,
          resetTime: "2026-05-30T00:00:00Z",
        },
        { modelId: "gemini-3-pro", tokenType: "REQUESTS", remainingFraction: 0.2 },
        // Same model, less-constrained token bucket — must lose to 0.2 above.
        { modelId: "gemini-2.5-pro", tokenType: "TOKENS", remainingFraction: 0.9 },
        { modelId: "gemini-3.1-pro-preview", tokenType: "REQUESTS", remainingFraction: 1 },
      ],
    };
    const snap = parseGeminiUsage(load, quota, NOW);

    expect(snap.providerId).toBe("gemini");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Gemini (Free)");
    // Every version collapses into exactly three broad tiers.
    expect(snap.windows.map((w) => w.id)).toEqual([
      "gemini:flash",
      "gemini:flash-lite",
      "gemini:pro",
    ]);

    const flash = snap.windows.find((w) => w.id === "gemini:flash");
    expect(flash?.label).toBe("Flash");
    expect(flash?.usedPercent).toBeCloseTo(40); // most-constrained: 1 - 0.6
    expect(flash?.resetsAt).toBe(Date.parse("2026-05-30T00:00:00Z"));

    expect(snap.windows.find((w) => w.id === "gemini:flash-lite")?.label).toBe("Flash Lite");

    const pro = snap.windows.find((w) => w.id === "gemini:pro");
    expect(pro?.label).toBe("Pro");
    expect(pro?.usedPercent).toBeCloseTo(80); // most-constrained across versions: 1 - 0.2
  });

  it("prefers paidTier and parses availableCredits as AI credits", () => {
    const snap = parseGeminiUsage(
      {
        currentTier: { id: "free-tier" },
        paidTier: {
          id: "g1-pro-tier",
          name: "Google AI Pro",
          availableCredits: [
            { creditType: "GOOGLE_ONE_AI", creditAmount: "1200.5" },
            { creditType: "BONUS", creditAmount: 300 },
          ],
        },
      },
      undefined,
      NOW,
    );
    expect(snap.plan).toBe("Google AI Pro");
    expect(snap.credits).toEqual({ balance: 1500.5, label: "AI credits" });
  });

  it("returns a plan-only snapshot when quota is unparseable", () => {
    const snap = parseGeminiUsage({ currentTier: { id: "standard-tier" } }, undefined, NOW);
    expect(snap.plan).toBe("Gemini Code Assist (Standard)");
    expect(snap.windows).toHaveLength(0);
  });
});

describe("collectGemini", () => {
  it("refreshes the token once on 401/403 and retries loadCodeAssist", async () => {
    const refreshOAuthToken = vi.fn<() => Promise<{ accessToken: string; refreshToken: string }>>(
      async () => ({
        accessToken: "fresh-token",
        refreshToken: "refresh-1",
      }),
    );
    const request = vi.fn<
      (input: {
        url: string;
        headers?: Record<string, string>;
      }) => Promise<{ status: number; headers: Record<string, string>; body: string }>
    >(async ({ url, headers }) => {
      if (url === GEMINI_LOAD_ENDPOINT && headers?.Authorization === "Bearer stale-token") {
        return { status: 401, headers: {}, body: "" };
      }
      if (url === GEMINI_LOAD_ENDPOINT && headers?.Authorization === "Bearer fresh-token") {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({ currentTier: { id: "free-tier" } }),
        };
      }
      if (url === GEMINI_QUOTA_ENDPOINT) {
        return { status: 200, headers: {}, body: JSON.stringify({ buckets: [] }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const host: HostPort = {
      http: { request },
      now: () => NOW,
      credentials: {
        getOAuthToken: async () => ({ accessToken: "stale-token", refreshToken: "refresh-1" }),
        refreshOAuthToken,
        getSecret: async () => undefined,
      },
    };

    const snap = await collectGemini(host);
    expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("Gemini (Free)");
  });

  it("degrades to auth-missing when refresh cannot recover from 403", async () => {
    const host: HostPort = {
      http: {
        request: async () => ({ status: 403, headers: {}, body: "" }),
      },
      now: () => NOW,
      credentials: {
        getOAuthToken: async () => ({ accessToken: "stale-token" }),
        refreshOAuthToken: async () => undefined,
        getSecret: async () => undefined,
      },
    };

    const snap = await collectGemini(host);
    expect(snap.status).toBe("auth-missing");
    expect(snap.error).toBe("token rejected (403)");
  });
});

describe("geminiQuotaGroup", () => {
  it("maps every model version and the preview channel to its broad family tier", () => {
    expect(geminiQuotaGroup("gemini-2.5-flash")).toEqual({ id: "flash", label: "Flash" });
    expect(geminiQuotaGroup("gemini-3-flash")).toEqual({ id: "flash", label: "Flash" });
    expect(geminiQuotaGroup("gemini-2.5-flash-lite")).toEqual({
      id: "flash-lite",
      label: "Flash Lite",
    });
    expect(geminiQuotaGroup("gemini-3.1-flash-lite")).toEqual({
      id: "flash-lite",
      label: "Flash Lite",
    });
    expect(geminiQuotaGroup("gemini-2.5-pro")).toEqual({ id: "pro", label: "Pro" });
    expect(geminiQuotaGroup("gemini-3-pro")).toEqual({ id: "pro", label: "Pro" });
    expect(geminiQuotaGroup("gemini-3.1-pro-preview")).toEqual({ id: "pro", label: "Pro" });
  });
});
