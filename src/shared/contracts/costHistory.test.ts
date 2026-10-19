import { describe, expect, it } from "vitest";
import { usageSpentSchema } from "./runtimeEvent";
import { profileTokenStatsSchema } from "./profileResults";
import { zodToJsonSchema } from "../remote/contract/jsonSchema";

// Exact field removals reproduce the approved baseline's two affected reader shapes.
const oldUsageReader = usageSpentSchema.omit({ tokens: true, cost: true });
const oldProfileReader = profileTokenStatsSchema.omit({ costs: true });
const oldUsage = {
  counterKind: "per-call",
  counter: 100,
  scopeId: "session",
  epoch: 0,
  sampleId: "call",
};

describe("protocol14 cost additions", () => {
  it("lets new readers consume old usage and old readers strip the new fields", () => {
    expect(usageSpentSchema.parse(oldUsage)).toEqual(oldUsage);
    expect(
      oldUsageReader.parse({
        ...oldUsage,
        tokens: { input: 60, output: 10, cacheRead: 30, cacheWrite: 0 },
        cost: { amount: 2, currency: "USD" },
      }),
    ).toEqual(oldUsage);
  });

  it("keeps both prior native object policies open for new fields", () => {
    for (const schema of [oldUsageReader, oldProfileReader]) {
      for (const io of ["input", "output"] as const) {
        expect(zodToJsonSchema(schema, io)).toMatchObject({
          additionalProperties: true,
          "x-poracode-unknownFields": "strip",
        });
      }
    }
  });

  it("accepts old Profile results without inventing cost history and strips new costs in old readers", () => {
    const old = {
      available: false,
      scope: "device",
      device: { id: "d", label: "Host", platform: "win32" },
      generatedAt: 0,
      timezoneOffsetMinutes: 0,
      windowDays: 7,
      lifetimeTokens: 0,
      peakDayTokens: 0,
      providers: [],
      accounts: [],
      models: [],
      tokenHeatmap: { metric: "tokens", windowDays: 7, cells: [], max: 0 },
      unavailableProviders: [],
    };
    expect(profileTokenStatsSchema.parse(old)).toEqual(old);
    expect(oldProfileReader.parse({ ...old, costs: { futureObject: true } })).toEqual(old);
  });
});
