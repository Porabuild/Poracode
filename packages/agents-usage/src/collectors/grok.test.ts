import { describe, expect, it } from "vitest";
import { parseGrokUsage } from "./grok";

const NOW = 1_717_000_000_000;

describe("parseGrokUsage", () => {
  it("maps the /billing config block to a monthly credits window", () => {
    const billing = {
      config: {
        monthlyLimit: { val: 60_000 },
        used: { val: 4277 },
        onDemandCap: { val: 0 },
        billingPeriodStart: "2026-05-01T00:00:00+00:00",
        billingPeriodEnd: "2026-06-01T00:00:00+00:00",
      },
    };
    const settings = { tier: { displayName: "SuperGrok" } };
    const snap = parseGrokUsage(billing, settings, NOW);

    expect(snap.providerId).toBe("grok");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("SuperGrok");

    const w = snap.windows[0]!;
    expect(w.id).toBe("monthly");
    expect(w.unit).toBe("credits");
    expect(w.used).toBe(4277);
    expect(w.limit).toBe(60_000);
    expect(w.usedPercent).toBeCloseTo((4277 / 60_000) * 100);
    expect(w.resetsAt).toBe(Date.parse("2026-06-01T00:00:00+00:00"));
  });

  it("handles a missing config without throwing", () => {
    const snap = parseGrokUsage({}, undefined, NOW);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(0);
    expect(snap.plan).toBeUndefined();
  });
});
