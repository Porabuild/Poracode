import { describe, expect, it } from "vitest";
import { z } from "zod";
import { usageSnapshotSchema } from "@poracode/agents-usage/types";
import { providerUsageResponseSchema } from "./usage";

describe("provider usage display metadata compatibility", () => {
  const previous = { snapshots: [], fromCache: true };

  it("continues decoding the previous released response shape", () => {
    expect(providerUsageResponseSchema.parse(previous)).toEqual(previous);
  });

  it("keeps previous readers correct when selected window IDs are added", () => {
    const legacyReader = z.object({
      snapshots: z.array(usageSnapshotSchema),
      fromCache: z.boolean(),
    });
    const next = { ...previous, ringLayouts: { "agent:work": { outerWindowId: "session-5h" } } };
    expect(legacyReader.parse(next)).toEqual(previous);
    expect(providerUsageResponseSchema.parse(next)).toEqual(next);
  });
});
