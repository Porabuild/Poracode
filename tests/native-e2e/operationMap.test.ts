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
    expect(committed.keyCount).toBe(212);
    expect(committed.counts).toEqual({
      route: 62,
      procedure: 100,
      "ws-client": 9,
      "ws-server": 10,
      replay: 15,
      runtime: 16,
    });
  });
});
