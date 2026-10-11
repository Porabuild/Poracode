import { describe, expect, it } from "vitest";
import { createRuntimePayloadProjectionRegistry } from "./runtimePayloadProjectionRegistry";
import type { RuntimePayloadProjectionSpec } from "@/shared/runtimePayloadProjection";
const spec: RuntimePayloadProjectionSpec = {
  formatOwnerKey: "fixture.payload/v1",
  originFormatVersion: 1,
  itemTypes: ["file_change"],
  maxStoredJsonUnits: 100,
  maxWireExpansionBytes: 16,
  maxDecodeExpansionBytes: 32,
  normalizePersistedRuntimePayload: (payload) => payload,
};
describe("payload projection registry", () => {
  it("rejects duplicate ownership rather than silently choosing a hook", () => {
    expect(() => createRuntimePayloadProjectionRegistry([spec, { ...spec }])).toThrow(/ambiguous/);
  });
  it.each([
    { formatOwnerKey: "" },
    { maxStoredJsonUnits: Infinity },
    { maxWireExpansionBytes: 1025 },
    { maxDecodeExpansionBytes: 31 },
    { itemTypes: [] },
    { originFormatVersion: 2 },
  ])("rejects unsafe declaration %j", (patch) => {
    expect(() =>
      createRuntimePayloadProjectionRegistry([
        { ...spec, ...patch } as RuntimePayloadProjectionSpec,
      ]),
    ).toThrow(/Invalid or ambiguous/);
  });
});
