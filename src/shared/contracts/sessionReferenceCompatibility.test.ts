import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sessionRefSchema } from "./common";

// Published reference shape before optional execution metadata. Its generated
// native schema also declares x-poracode-unknownFields:strip, matching Zod.
const previousSessionRefSchema = z.object({
  providerSessionId: z.string().min(1),
  discoveredAt: z.string().min(1),
});
const oldReference = { providerSessionId: "session-1", discoveredAt: "2026-10-07T10:00:00Z" };

describe("session reference upgrade compatibility", () => {
  it("keeps previously published native/default references valid", () => {
    expect(sessionRefSchema.parse(oldReference)).toEqual(oldReference);
  });
  it("lets previous readers accept an optional opaque scope without interpreting it", () => {
    expect(
      previousSessionRefSchema.parse({
        ...oldReference,
        executionIdentity: "opaque-account-scope",
      }),
    ).toEqual(oldReference);
  });
  it("retains a bounded scope on current wire and persistence round trips", () => {
    const reference = { ...oldReference, executionIdentity: "opaque-account-scope" };
    expect(sessionRefSchema.parse(JSON.parse(JSON.stringify(reference)))).toEqual(reference);
    expect(
      sessionRefSchema.safeParse({ ...oldReference, executionIdentity: "x".repeat(257) }).success,
    ).toBe(false);
  });
});
