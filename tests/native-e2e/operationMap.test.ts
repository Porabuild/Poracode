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
    if (live.manifestHash !== committed.manifestHash) {
      // The generated inventory changed without regenerating the committed
      // operation map; name the refresh command instead of diffing 266 keys.
      throw new Error(
        "tests/native-e2e/harness/operation-map.json manifestHash is stale: the protocol manifest " +
          "or protocol/remote/v3/generated/inventory.json changed without regenerating the " +
          "committed operation map. Refresh it in the same change with: " +
          "node --experimental-transform-types --disable-warning=ExperimentalWarning " +
          "tests/native-e2e/harness/refreshOperationMap.ts",
      );
    }
    expect(sortCodePoints(Object.keys(live.operations))).toEqual(collectManifestKeys(manifest));
    expect(live).toEqual(committed);
    expect(committed.keyCount).toBe(EXPECTED_OPERATION_KEY_COUNT);
    expect(committed.counts).toEqual({
      route: 88,
      procedure: 126,
      "ws-client": 9,
      "ws-server": 11,
      replay: 16,
      runtime: 16,
    });
  });
});
