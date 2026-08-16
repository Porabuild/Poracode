import { describe, expect, it } from "vitest";
import {
  EXPECTED_OPERATION_KEY_COUNT,
  assertExpectedInventoryCounts,
  buildOperationMap,
  collectManifestKeys,
  computeManifestHash,
  inventorySourceHash,
  loadCommittedOperationMap,
} from "./harness/operationMap.ts";
import { loadProtocolManifest } from "./harness/manifest.ts";
import { sortCodePoints } from "./harness/sort.ts";

describe("operation-map inventory lock", () => {
  it("fails on additions, removals, or manifest-hash drift", () => {
    const manifest = loadProtocolManifest();
    const live = buildOperationMap(manifest);
    const committed = loadCommittedOperationMap();
    assertExpectedInventoryCounts(live);
    expect(live.keyCount).toBe(EXPECTED_OPERATION_KEY_COUNT);
    expect(live.manifestHash).toBe(computeManifestHash(manifest, inventorySourceHash()));
    expect(sortCodePoints(Object.keys(live.operations))).toEqual(collectManifestKeys(manifest));
    expect(live).toEqual(committed);
    expect(committed.keyCount).toBe(201);
    expect(committed.counts).toEqual({
      route: 56,
      procedure: 100,
      "ws-client": 8,
      "ws-server": 9,
      replay: 14,
      runtime: 14,
    });
  });
});
