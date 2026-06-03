import { describe, expect, it } from "vitest";
import { geminiQuotaGroup, parseGeminiUsage } from "./gemini";

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

  it("returns a plan-only snapshot when quota is unparseable", () => {
    const snap = parseGeminiUsage({ currentTier: { id: "standard-tier" } }, undefined, NOW);
    expect(snap.plan).toBe("Gemini Code Assist (Standard)");
    expect(snap.windows).toHaveLength(0);
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
