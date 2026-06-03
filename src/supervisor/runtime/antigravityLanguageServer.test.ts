import { describe, expect, it } from "vitest";
import { modelsFromBody, planFromUserStatus } from "./antigravityLanguageServer";

describe("modelsFromBody", () => {
  it("collects model labels + remaining fractions from nested clientModelConfigs", () => {
    const body = {
      result: {
        clientModelConfigs: [
          {
            label: "Gemini 3 Pro",
            quotaInfo: { remainingFraction: 0.5, resetTime: "2026-01-01T00:00:00Z" },
          },
          { label: "Claude Opus", quotaInfo: { remainingFraction: 0.2 } },
          { label: "no quota here" },
        ],
      },
    };
    const models = modelsFromBody(body);
    expect(models).toEqual([
      {
        label: "Gemini 3 Pro",
        remainingFraction: 0.5,
        resetsAt: Date.parse("2026-01-01T00:00:00Z"),
      },
      { label: "Claude Opus", remainingFraction: 0.2, resetsAt: undefined },
    ]);
  });

  it("returns [] for a body with no quota-bearing objects", () => {
    expect(modelsFromBody({ anything: [1, "two", null] })).toEqual([]);
    expect(modelsFromBody(undefined)).toEqual([]);
  });
});

describe("planFromUserStatus", () => {
  it("prefers userTier.name over the legacy planInfo.planName", () => {
    expect(
      planFromUserStatus({
        userStatus: {
          userTier: { name: "Pro" },
          planStatus: { planInfo: { planName: "Legacy" } },
        },
      }),
    ).toBe("Pro");
  });

  it("falls back to planInfo.planName when there is no userTier", () => {
    expect(
      planFromUserStatus({ userStatus: { planStatus: { planInfo: { planName: "Free" } } } }),
    ).toBe("Free");
  });

  it("returns undefined when neither is present", () => {
    expect(planFromUserStatus({ userStatus: {} })).toBeUndefined();
    expect(planFromUserStatus(null)).toBeUndefined();
  });
});
